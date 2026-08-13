import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type PriceListType,
  type TenantTx,
} from "@24hits/database";
import { newId } from "@24hits/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { LedgerService } from "../inventory/ledger.service.js";
import { CostService } from "../inventory/cost.service.js";
import { BalanceService } from "../inventory/balance.service.js";
import { ReservationService } from "../inventory/reservation.service.js";
import type { CreateOrderInput } from "./sales.dto.js";

// Renglón ya calculado (precio resuelto + totales) listo para persistir.
interface ResolvedLine {
  variantId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly cost: CostService,
    private readonly balances: BalanceService,
    private readonly reservations: ReservationService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  async get(organizationId: string, id: string) {
    const order = await this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findFirst({ where: { id }, include: { items: true, customer: true } })
    );
    if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
    return order;
  }

  // Crea un pedido en DRAFT. Resuelve precio por renglón (override o lista de
  // precios vigente) y calcula totales en Decimal. NO toca inventario (ADR-020).
  async create(organizationId: string, userId: string, input: CreateOrderInput) {
    const order = await this.prisma.withTenant(organizationId, async (tx) => {
      // Idempotencia: si ya existe un pedido con el mismo key, devolverlo.
      if (input.idempotencyKey) {
        const existing = await tx.order.findUnique({
          where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
          include: { items: true },
        });
        if (existing) return existing;
      }

      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId }, select: { branchId: true } });
      if (!wh) throw AppException.badRequest("Almacén no encontrado");

      let customerType: PriceListType = "RETAIL";
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId },
          select: { type: true, status: true },
        });
        if (!customer) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");
        if (customer.status !== "ACTIVE") {
          throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "El cliente está inactivo");
        }
        customerType = customer.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
      }

      // Lista de precios: explícita o la ACTIVE que corresponda al tipo de cliente.
      const priceList = input.priceListId
        ? await tx.priceList.findFirst({ where: { id: input.priceListId }, select: { id: true } })
        : await tx.priceList.findFirst({ where: { type: customerType, status: "ACTIVE" }, select: { id: true } });
      if (input.priceListId && !priceList) throw AppException.badRequest("Lista de precios no encontrada");

      const lines = await this.resolveLines(tx, priceList?.id ?? null, input);

      let subtotal = new Prisma.Decimal(0);
      let discountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      let total = new Prisma.Decimal(0);
      for (const l of lines) {
        const base = l.unitPrice.times(l.quantity);
        const net = base.minus(l.discount);
        const tax = net.times(l.taxRate);
        subtotal = subtotal.plus(base);
        discountTotal = discountTotal.plus(l.discount);
        taxTotal = taxTotal.plus(tax);
        total = total.plus(l.lineTotal);
      }

      return tx.order.create({
        data: {
          organizationId,
          branchId: wh.branchId,
          warehouseId: input.warehouseId,
          customerId: input.customerId ?? null,
          number: `SO-${newId().replace(/-/g, "").slice(-12).toUpperCase()}`,
          status: "DRAFT",
          channel: input.channel ?? null,
          currency: input.currency.toUpperCase(),
          priceListId: priceList?.id ?? null,
          subtotal,
          discountTotal,
          taxTotal,
          total,
          notes: input.notes ?? null,
          createdByUserId: userId,
          correlationId: RequestContext.correlationId(),
          idempotencyKey: input.idempotencyKey ?? null,
          items: {
            create: lines.map((l) => ({
              organizationId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              taxRate: l.taxRate,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      action: "order.created",
      organizationId,
      entityType: "Order",
      entityId: order.id,
      after: { number: order.number, total: order.total.toString() },
    });
    return order;
  }

  // Resuelve precio por renglón: override explícito o precio vigente de la lista.
  private async resolveLines(
    tx: TenantTx,
    priceListId: string | null,
    input: CreateOrderInput
  ): Promise<ResolvedLine[]> {
    const now = new Date();
    const lines: ResolvedLine[] = [];
    for (const item of input.items) {
      const quantity = new Prisma.Decimal(item.quantity);

      let unitPrice: Prisma.Decimal;
      if (item.unitPrice != null) {
        unitPrice = new Prisma.Decimal(item.unitPrice);
      } else {
        if (!priceListId) {
          throw new AppException(
            422,
            ErrorCode.PRICE_NOT_FOUND,
            "No hay lista de precios y el renglón no trae precio explícito"
          );
        }
        const priceItem = await tx.priceListItem.findFirst({
          where: {
            priceListId,
            variantId: item.variantId,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
          orderBy: { validFrom: "desc" },
        });
        if (!priceItem) {
          throw new AppException(
            422,
            ErrorCode.PRICE_NOT_FOUND,
            `Sin precio vigente para la variante ${item.variantId}`
          );
        }
        unitPrice = new Prisma.Decimal(priceItem.price);
      }

      const discount = new Prisma.Decimal(item.discount);
      const taxRate = new Prisma.Decimal(item.taxRate);
      const base = unitPrice.times(quantity);
      const net = base.minus(discount);
      if (net.lt(0)) {
        throw AppException.badRequest("El descuento no puede exceder el importe del renglón");
      }
      const lineTotal = net.plus(net.times(taxRate));
      lines.push({ variantId: item.variantId, quantity, unitPrice, discount, taxRate, lineTotal });
    }
    return lines;
  }

  // CONFIRM (ADR-021): reserva inventario por renglón vía ReservationService
  // (bloqueo FOR UPDATE, idempotente por key). Si un renglón falla, libera las
  // reservas ya creadas (compensación) y propaga el error. Baja `available`, no `onHand`.
  async confirm(organizationId: string, userId: string, orderId: string) {
    const order = await this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findFirst({ where: { id: orderId }, include: { items: true } })
    );
    if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
    if (order.status !== "DRAFT") {
      throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "Solo un pedido en DRAFT puede confirmarse");
    }
    if (order.items.length === 0) {
      throw new AppException(422, ErrorCode.ORDER_EMPTY, "El pedido no tiene renglones");
    }

    const created: { itemId: string; reservationId: string }[] = [];
    try {
      for (const item of order.items) {
        const reservation = await this.reservations.reserve(organizationId, {
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          variantId: item.variantId,
          quantity: item.quantity.toString(),
          referenceType: "ORDER",
          referenceId: order.id,
          idempotencyKey: `order:${order.id}:item:${item.id}`,
          createdByUserId: userId,
        });
        created.push({ itemId: item.id, reservationId: reservation.id });
      }
    } catch (err) {
      // Compensación: libera lo que sí se reservó para no dejar holds huérfanos.
      for (const c of created) {
        await this.reservations.release(organizationId, c.reservationId).catch(() => undefined);
      }
      throw err;
    }

    await this.prisma.withTenant(organizationId, async (tx) => {
      for (const c of created) {
        await tx.orderItem.update({ where: { id: c.itemId }, data: { reservationId: c.reservationId } });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
    });

    await this.audit.record({
      action: "order.confirmed",
      organizationId,
      entityType: "Order",
      entityId: order.id,
    });
    return this.get(organizationId, order.id);
  }

  // FULFILL (ADR-021): por renglón con reserva activa, en UNA transacción atómica:
  // toma el costo promedio (COGS), aplica SALE (onHand -= qty, unitCost = COGS),
  // libera el hold y marca la reserva CONSUMED, reduce la base del costo promedio,
  // y guarda fulfilledQuantity + unitCostSnapshot. Estado → FULFILLED.
  async fulfill(organizationId: string, userId: string, orderId: string) {
    const correlationId = RequestContext.correlationId();
    await this.prisma.withTenant(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (order.status !== "CONFIRMED" && order.status !== "PARTIALLY_FULFILLED") {
        throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "El pedido no está confirmado");
      }

      for (const item of order.items) {
        // Ya entregado (idempotente a nivel renglón).
        if (new Prisma.Decimal(item.fulfilledQuantity).gte(item.quantity)) continue;
        if (!item.reservationId) {
          throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "Renglón sin reserva; reconfirma el pedido");
        }

        const reservation = await tx.inventoryReservation.findFirst({
          where: { id: item.reservationId, organizationId },
        });
        if (!reservation || reservation.status !== "ACTIVE") {
          throw new AppException(
            409,
            ErrorCode.INVENTORY_RESERVATION_NOT_FOUND,
            "La reserva del renglón no está activa"
          );
        }

        const qty = new Prisma.Decimal(item.quantity);

        // 1) COGS = costo promedio vigente (snapshot; no recalcula historia).
        const variantCost = await tx.variantCost.findUnique({ where: { variantId: item.variantId } });
        const averageCost = new Prisma.Decimal(variantCost?.averageCost ?? 0);

        // 2) Movimiento físico SALE (onHand -= qty) con el COGS como snapshot.
        await this.ledger.applyMovement(tx, {
          organizationId,
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          variantId: item.variantId,
          movementType: "SALE",
          quantity: qty,
          unitCost: averageCost,
          totalCost: averageCost.times(qty),
          referenceType: "ORDER",
          referenceId: order.id,
          createdByUserId: userId,
          correlationId,
          idempotencyKey: `order:${order.id}:fulfill:${item.id}`,
        });

        // 3) Liberar el hold reservado y marcar la reserva CONSUMED.
        await tx.inventoryBalance.update({
          where: {
            organizationId_warehouseId_variantId: {
              organizationId,
              warehouseId: order.warehouseId,
              variantId: item.variantId,
            },
          },
          data: { reserved: { decrement: qty }, version: { increment: 1 } },
        });
        await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });

        // 4) Reducir la base de cantidad del costo promedio.
        await this.cost.reduceOnOutbound(tx, item.variantId, qty);

        // 5) Persistir COGS y cantidad entregada en el renglón.
        await tx.orderItem.update({
          where: { id: item.id },
          data: { fulfilledQuantity: qty, unitCostSnapshot: averageCost },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        // Cierre de la venta: si ya venía saldado, la entrega la deja COMPLETED.
        data: { status: order.paymentStatus === "PAID" ? "COMPLETED" : "FULFILLED", fulfilledAt: new Date() },
      });
    });

    await this.audit.record({
      action: "order.fulfilled",
      organizationId,
      entityType: "Order",
      entityId: orderId,
    });
    return this.get(organizationId, orderId);
  }

  // CANCEL (ADR-020): solo DRAFT o CONFIRMED. Si estaba CONFIRMED libera todas
  // las reservas activas (restaura `available`). No cancela pedidos ya entregados.
  async cancel(organizationId: string, orderId: string) {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
        throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "Solo se cancela un pedido en DRAFT o CONFIRMED");
      }

      for (const item of order.items) {
        if (!item.reservationId) continue;
        const reservation = await tx.inventoryReservation.findFirst({
          where: { id: item.reservationId, organizationId },
        });
        if (!reservation || reservation.status !== "ACTIVE") continue;
        await this.balances.lockOrCreate(tx, {
          organizationId,
          branchId: reservation.branchId,
          warehouseId: reservation.warehouseId,
          variantId: reservation.variantId,
        });
        await tx.inventoryBalance.update({
          where: {
            organizationId_warehouseId_variantId: {
              organizationId,
              warehouseId: reservation.warehouseId,
              variantId: reservation.variantId,
            },
          },
          data: { reserved: { decrement: reservation.quantity }, version: { increment: 1 } },
        });
        await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    });

    await this.audit.record({
      action: "order.cancelled",
      organizationId,
      entityType: "Order",
      entityId: orderId,
    });
    return this.get(organizationId, orderId);
  }
}
