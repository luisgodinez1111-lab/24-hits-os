import { Injectable } from "@nestjs/common";
import { Prisma, type Payment, type PaymentStatus, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import type { RecordPaymentInput } from "./cash.dto.js";

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  listByOrder(organizationId: string, orderId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.payment.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } })
    );
  }

  // Neto pagado del pedido = Σ amount de pagos COMPLETED (excluye REVERSED).
  private async netPaid(tx: TenantTx, orderId: string): Promise<Prisma.Decimal> {
    const agg = await tx.payment.aggregate({ where: { orderId, status: "COMPLETED" }, _sum: { amount: true } });
    return new Prisma.Decimal(agg._sum.amount ?? 0);
  }

  private statusFor(net: Prisma.Decimal, total: Prisma.Decimal): PaymentStatus {
    if (net.gte(total) && total.gt(0)) return "PAID";
    if (net.lte(0)) return "PENDING";
    return "PARTIAL";
  }

  // Registra un cobro contra el pedido. Bloquea la fila del pedido (FOR UPDATE) para
  // impedir doble cobro concurrente; recalcula paymentStatus desde el ledger (ADR-022).
  async record(organizationId: string, userId: string, input: RecordPaymentInput): Promise<Payment> {
    const payment = await this.prisma.withTenant(organizationId, async (tx) => {
      // Idempotencia (tras entrar a la transacción).
      if (input.idempotencyKey) {
        const existing = await tx.payment.findUnique({
          where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) return existing;
      }

      // Bloqueo pesimista del pedido para serializar cobros concurrentes.
      await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${input.orderId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: input.orderId },
        select: { id: true, total: true, currency: true, status: true, branchId: true },
      });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (order.status === "CANCELLED") {
        throw new AppException(409, ErrorCode.PAYMENT_INVALID_STATE, "No se puede cobrar un pedido cancelado");
      }

      const amount = new Prisma.Decimal(input.amount);
      // Turno de caja OPCIONAL: si se indica uno abierto, el cobro se liga (para el
      // corte); si no, el cobro se registra igual (operación por pedido/entrega).
      let cashSessionId: string | null = null;
      if (input.cashSessionId) {
        const session = await tx.cashSession.findFirst({ where: { id: input.cashSessionId }, select: { id: true, status: true } });
        if (!session) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");
        if (session.status !== "OPEN") throw new AppException(409, ErrorCode.CASH_SESSION_NOT_OPEN, "El turno de caja no está abierto");
        cashSessionId = session.id;
      }

      const total = new Prisma.Decimal(order.total);
      const net = await this.netPaid(tx, order.id);
      if (net.plus(amount).gt(total)) {
        throw new AppException(409, ErrorCode.PAYMENT_EXCEEDS_TOTAL, "El cobro excede el saldo pendiente del pedido");
      }

      const created = await tx.payment.create({
        data: {
          organizationId,
          branchId: order.branchId,
          orderId: order.id,
          cashSessionId,
          method: input.method,
          amount,
          currency: (input.currency ?? order.currency).toUpperCase(),
          reference: input.reference ?? null,
          status: "COMPLETED",
          createdByUserId: userId,
          correlationId: RequestContext.correlationId(),
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      // Cierre de la venta: si el pedido ya está entregado y queda saldado → COMPLETED.
      const nextPaymentStatus = this.statusFor(net.plus(amount), total);
      const completes = nextPaymentStatus === "PAID" && order.status === "FULFILLED";
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: nextPaymentStatus,
          ...(completes ? { status: "COMPLETED" } : {}),
        },
      });
      return created;
    });

    await this.audit.record({
      action: "payment.recorded",
      organizationId,
      entityType: "Payment",
      entityId: payment.id,
      after: { orderId: payment.orderId, method: payment.method, amount: payment.amount.toString() },
    });
    return payment;
  }

  // Anula un cobro: marca el original REVERSED y crea la contrapartida (también
  // REVERSED, fuera del neto). Recalcula el paymentStatus del pedido (ADR-022).
  async reverse(organizationId: string, userId: string, paymentId: string): Promise<Payment> {
    const reversal = await this.prisma.withTenant(organizationId, async (tx) => {
      const original = await tx.payment.findFirst({ where: { id: paymentId } });
      if (!original) throw new AppException(404, ErrorCode.PAYMENT_NOT_FOUND, "Pago no encontrado");
      if (original.status !== "COMPLETED") {
        throw new AppException(409, ErrorCode.PAYMENT_INVALID_STATE, "El pago no está en estado COMPLETED");
      }
      // No se puede anular efectivo de un turno ya cerrado (cajón cuadrado).
      if (original.method === "CASH" && original.cashSessionId) {
        const session = await tx.cashSession.findFirst({ where: { id: original.cashSessionId }, select: { status: true } });
        if (session?.status !== "OPEN") {
          throw new AppException(409, ErrorCode.PAYMENT_INVALID_STATE, "No se puede anular efectivo de un turno cerrado");
        }
      }

      if (original.orderId) {
        await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${original.orderId}::uuid AND "organizationId" = ${organizationId}::uuid FOR UPDATE`;
      }

      await tx.payment.update({ where: { id: original.id }, data: { status: "REVERSED", reversedAt: new Date() } });
      const contra = await tx.payment.create({
        data: {
          organizationId,
          branchId: original.branchId,
          orderId: original.orderId,
          cashSessionId: original.cashSessionId,
          method: original.method,
          amount: original.amount,
          currency: original.currency,
          reference: original.reference,
          status: "REVERSED",
          reversalOfId: original.id,
          reversedAt: new Date(),
          createdByUserId: userId,
          correlationId: RequestContext.correlationId(),
        },
      });

      if (original.orderId) {
        const order = await tx.order.findFirst({ where: { id: original.orderId }, select: { id: true, total: true, status: true } });
        if (order) {
          const net = await this.netPaid(tx, order.id);
          const nextPaymentStatus = this.statusFor(net, new Prisma.Decimal(order.total));
          // Si el pedido estaba cerrado y ya no queda saldado, reabre a FULFILLED.
          const reopens = order.status === "COMPLETED" && nextPaymentStatus !== "PAID";
          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: nextPaymentStatus,
              ...(reopens ? { status: "FULFILLED" } : {}),
            },
          });
        }
      }
      return contra;
    });

    await this.audit.record({
      action: "payment.reversed",
      organizationId,
      entityType: "Payment",
      entityId: paymentId,
      after: { reversalId: reversal.id },
    });
    return reversal;
  }

  // ── Reconciliación de efectivo del repartidor ──────────────────────────────
  // El efectivo cobrado en reparto entra como Payment CASH SIN turno (cashSessionId
  // null): dinero en la bolsa del repartidor, invisible para el arqueo. Estas dos
  // operaciones lo hacen visible y lo "entregan" a un turno de caja abierto.

  // Filtro del efectivo de reparto sin entregar de un repartidor (por usuario).
  private static floatingCashWhere(userId: string) {
    return {
      createdByUserId: userId,
      method: "CASH" as const,
      status: "COMPLETED" as const,
      cashSessionId: null,
      order: { is: { deliveryStatus: { not: null } } }, // solo pedidos a domicilio
    };
  }

  // Cuánto efectivo de reparto trae el repartidor sin entregar todavía + a qué turnos
  // abiertos puede entregarlo. Base del "corte" al cerrar la ruta.
  async driverCashSummary(organizationId: string, userId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const payments = await tx.payment.findMany({
        where: PaymentService.floatingCashWhere(userId),
        select: {
          id: true,
          amount: true,
          createdAt: true,
          order: { select: { number: true, customer: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      const total = payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      const openSessions = await tx.cashSession.findMany({
        where: { status: "OPEN" },
        select: { id: true, register: { select: { name: true } } },
        orderBy: { openedAt: "desc" },
      });
      return {
        total: total.toString(),
        count: payments.length,
        items: payments.map((p) => ({
          id: p.id,
          amount: p.amount.toString(),
          at: p.createdAt,
          number: p.order?.number ?? null,
          customerName: p.order?.customer?.name ?? null,
        })),
        openSessions: openSessions.map((s) => ({ id: s.id, register: s.register?.name ?? "Caja" })),
      };
    });
  }

  // Entrega ese efectivo a un turno ABIERTO: liga los cobros al turno para que entren
  // al arqueo (expectedCash los suma como pagos CASH — sin doble conteo). Al ligarlos
  // dejan de estar "flotando", así que reintentar no vuelve a sumar nada.
  async driverCashHandover(organizationId: string, userId: string, cashSessionId: string) {
    const result = await this.prisma.withTenant(organizationId, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id: cashSessionId }, select: { id: true, status: true } });
      if (!session) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");
      if (session.status !== "OPEN") throw new AppException(409, ErrorCode.CASH_SESSION_NOT_OPEN, "El turno de caja no está abierto");
      const floating = await tx.payment.findMany({ where: PaymentService.floatingCashWhere(userId), select: { id: true, amount: true } });
      const total = floating.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
      if (floating.length > 0) {
        await tx.payment.updateMany({ where: { id: { in: floating.map((f) => f.id) } }, data: { cashSessionId } });
      }
      return { handedOver: total.toString(), count: floating.length };
    });
    await this.audit.record({
      action: "delivery.cash_handover",
      organizationId,
      entityType: "CashSession",
      entityId: cashSessionId,
      after: { handedOver: result.handedOver, count: result.count, driverUserId: userId },
    });
    return result;
  }
}
