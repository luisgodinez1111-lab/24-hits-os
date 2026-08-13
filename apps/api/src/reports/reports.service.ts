import { Injectable } from "@nestjs/common";
import { Prisma, type PaymentMethod, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { PermissionService } from "../iam/permission.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import type { ReportRangeInput, SalesRegisterQuery } from "./reports.dto.js";

const ZERO = new Prisma.Decimal(0);
const METHODS: PaymentMethod[] = ["CASH", "CARD", "TRANSFER", "OTHER"];

// Reportes financieros: SOLO lectura, derivados de los ledgers existentes
// (pedidos, pagos, movimientos SALE con COGS snapshot, sesiones de caja). No hay
// estado nuevo ni cifras precalculadas: se reconstruye todo con Decimal exacto.
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService
  ) {}

  private resolveRange(range: ReportRangeInput): { from: Date; to: Date } {
    const to = range.to ?? new Date();
    const from = range.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  private byMethodTemplate(): Record<PaymentMethod, Prisma.Decimal> {
    return { CASH: ZERO, CARD: ZERO, TRANSFER: ZERO, OTHER: ZERO };
  }

  // KPIs de ventas. Los campos de costo/utilidad SOLO se incluyen si la membresía
  // tiene `profits.read` (filtro en el BACKEND, no en la UI).
  async salesSummary(organizationId: string, range: ReportRangeInput, membershipId?: string) {
    const { from, to } = this.resolveRange(range);
    const branchId = range.branchId;

    const result = await this.prisma.withTenant(organizationId, async (tx) => {
      const orders = await tx.order.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" }, ...(branchId ? { branchId } : {}) },
        select: { total: true },
      });
      let billed = ZERO;
      for (const o of orders) billed = billed.plus(o.total);
      const orderCount = orders.length;
      const avgTicket = orderCount > 0 ? billed.dividedBy(orderCount) : ZERO;

      const pays = await tx.payment.findMany({
        where: { createdAt: { gte: from, lte: to }, status: "COMPLETED", ...(branchId ? { branchId } : {}) },
        select: { method: true, amount: true },
      });
      const byMethod = this.byMethodTemplate();
      let collected = ZERO;
      for (const p of pays) {
        byMethod[p.method] = byMethod[p.method].plus(p.amount);
        collected = collected.plus(p.amount);
      }

      return { billed, orderCount, avgTicket, collected, byMethod };
    });

    const base = {
      from: from.toISOString(),
      to: to.toISOString(),
      billed: result.billed.toString(),
      collected: result.collected.toString(),
      outstanding: result.billed.minus(result.collected).toString(),
      orderCount: result.orderCount,
      avgTicket: result.avgTicket.toString(),
      byPaymentMethod: Object.fromEntries(METHODS.map((m) => [m, result.byMethod[m].toString()])),
    };

    const canSeeProfit = membershipId ? await this.permissions.can(membershipId, ["profits.read"]) : false;
    if (!canSeeProfit) return base;

    const profit = await this.prisma.withTenant(organizationId, (tx) => this.computeProfit(tx, from, to, branchId));
    return {
      ...base,
      revenueNet: profit.revenueNet.toString(),
      cogs: profit.cogs.toString(),
      grossProfit: profit.grossProfit.toString(),
      margin: profit.margin.toString(),
    };
  }

  // Utilidad = Σ (precio − descuento) de renglones entregados − Σ COGS snapshot.
  private async computeProfit(tx: TenantTx, from: Date, to: Date, branchId?: string) {
    const items = await tx.orderItem.findMany({
      where: {
        fulfilledQuantity: { gt: 0 },
        order: { fulfilledAt: { gte: from, lte: to }, status: { not: "CANCELLED" }, ...(branchId ? { branchId } : {}) },
      },
      select: { unitPrice: true, discount: true, fulfilledQuantity: true, unitCostSnapshot: true },
    });
    let revenueNet = ZERO;
    let cogs = ZERO;
    for (const it of items) {
      const qty = new Prisma.Decimal(it.fulfilledQuantity);
      revenueNet = revenueNet.plus(new Prisma.Decimal(it.unitPrice).times(qty).minus(it.discount));
      cogs = cogs.plus(new Prisma.Decimal(it.unitCostSnapshot ?? 0).times(qty));
    }
    const grossProfit = revenueNet.minus(cogs);
    const margin = revenueNet.gt(0) ? grossProfit.dividedBy(revenueNet) : ZERO;
    return { revenueNet, cogs, grossProfit, margin };
  }

  // REGISTRO DE VENTAS: diario transaccional (una fila por venta) que UNE el pedido con
  // sus pagos, su nota de venta y su COGS. Excluye DRAFT por defecto. Los campos de
  // costo/utilidad solo se incluyen si la membresía tiene profits.read (filtro backend).
  async salesRegister(organizationId: string, query: SalesRegisterQuery, membershipId?: string) {
    const { from, to } = this.resolveRange(query);
    const includeCost = membershipId ? await this.permissions.can(membershipId, ["profits.read"]) : false;

    return this.prisma.withTenant(organizationId, async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          status: query.status ?? { not: "DRAFT" },
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.customerId ? { customerId: query.customerId } : {}),
          ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
        },
        select: {
          id: true, number: true, status: true, paymentStatus: true, total: true, currency: true,
          branchId: true, createdByUserId: true, createdAt: true, confirmedAt: true, fulfilledAt: true,
          customer: { select: { name: true } },
          items: { select: { fulfilledQuantity: true, unitPrice: true, discount: true, unitCostSnapshot: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      });

      const ids = orders.map((o) => o.id);
      const [payments, notes, credits] = await Promise.all([
        ids.length ? tx.payment.findMany({ where: { orderId: { in: ids }, status: "COMPLETED" }, select: { orderId: true, method: true, amount: true } }) : [],
        ids.length ? tx.saleNote.findMany({ where: { orderId: { in: ids }, status: "ISSUED" }, select: { orderId: true, number: true } }) : [],
        ids.length ? tx.creditNote.findMany({ where: { orderId: { in: ids }, status: "ISSUED" }, select: { orderId: true, total: true } }) : [],
      ]);

      const paidByOrder = new Map<string, Prisma.Decimal>();
      const methodsByOrder = new Map<string, Set<string>>();
      for (const p of payments) {
        if (!p.orderId) continue;
        paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) ?? ZERO).plus(p.amount));
        const set = methodsByOrder.get(p.orderId) ?? new Set<string>();
        set.add(p.method);
        methodsByOrder.set(p.orderId, set);
      }
      const noteByOrder = new Map<string, string>();
      for (const n of notes) if (n.orderId) noteByOrder.set(n.orderId, n.number);
      const creditedByOrder = new Map<string, Prisma.Decimal>();
      for (const c of credits) {
        if (!c.orderId) continue;
        creditedByOrder.set(c.orderId, (creditedByOrder.get(c.orderId) ?? ZERO).plus(c.total));
      }

      let tBilled = ZERO;
      let tCollected = ZERO;
      let tCredited = ZERO;
      let tCogs = ZERO;
      let tProfit = ZERO;

      const rows = orders.map((o) => {
        const total = new Prisma.Decimal(o.total);
        const paid = paidByOrder.get(o.id) ?? ZERO;
        let cogs = ZERO;
        let revenueNet = ZERO;
        for (const it of o.items) {
          const q = new Prisma.Decimal(it.fulfilledQuantity);
          revenueNet = revenueNet.plus(new Prisma.Decimal(it.unitPrice).times(q).minus(it.discount));
          cogs = cogs.plus(new Prisma.Decimal(it.unitCostSnapshot ?? 0).times(q));
        }
        const grossProfit = revenueNet.minus(cogs);
        const credited = creditedByOrder.get(o.id) ?? ZERO;
        tBilled = tBilled.plus(total);
        tCollected = tCollected.plus(paid);
        tCredited = tCredited.plus(credited);
        tCogs = tCogs.plus(cogs);
        tProfit = tProfit.plus(grossProfit);

        return {
          orderId: o.id,
          number: o.number,
          date: (o.fulfilledAt ?? o.confirmedAt ?? o.createdAt).toISOString(),
          status: o.status,
          paymentStatus: o.paymentStatus,
          customerName: o.customer?.name ?? null,
          branchId: o.branchId,
          currency: o.currency,
          total: total.toString(),
          paid: paid.toString(),
          balance: total.minus(paid).toString(),
          credited: credited.toString(),
          methods: [...(methodsByOrder.get(o.id) ?? [])],
          saleNoteNumber: noteByOrder.get(o.id) ?? null,
          createdByUserId: o.createdByUserId,
          ...(includeCost ? { cogs: cogs.toString(), grossProfit: grossProfit.toString() } : {}),
        };
      });

      const totals = {
        count: rows.length,
        billed: tBilled.toString(),
        collected: tCollected.toString(),
        outstanding: tBilled.minus(tCollected).toString(),
        credited: tCredited.toString(),
        ...(includeCost ? { cogs: tCogs.toString(), grossProfit: tProfit.toString() } : {}),
      };

      return { rows, totals };
    });
  }

  // Utilidad por producto (requiere profits.read en el controller). Top 50 por utilidad.
  async profitByProduct(organizationId: string, range: ReportRangeInput) {
    const { from, to } = this.resolveRange(range);
    const branchId = range.branchId;

    return this.prisma.withTenant(organizationId, async (tx) => {
      const items = await tx.orderItem.findMany({
        where: {
          fulfilledQuantity: { gt: 0 },
          order: { fulfilledAt: { gte: from, lte: to }, status: { not: "CANCELLED" }, ...(branchId ? { branchId } : {}) },
        },
        select: { variantId: true, unitPrice: true, discount: true, fulfilledQuantity: true, unitCostSnapshot: true },
      });

      const acc = new Map<string, { qty: Prisma.Decimal; revenue: Prisma.Decimal; cogs: Prisma.Decimal }>();
      for (const it of items) {
        const qty = new Prisma.Decimal(it.fulfilledQuantity);
        const row = acc.get(it.variantId) ?? { qty: ZERO, revenue: ZERO, cogs: ZERO };
        row.qty = row.qty.plus(qty);
        row.revenue = row.revenue.plus(new Prisma.Decimal(it.unitPrice).times(qty).minus(it.discount));
        row.cogs = row.cogs.plus(new Prisma.Decimal(it.unitCostSnapshot ?? 0).times(qty));
        acc.set(it.variantId, row);
      }

      const variantIds = [...acc.keys()];
      const variants = variantIds.length
        ? await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, sku: true, name: true, product: { select: { name: true } } },
          })
        : [];
      const nameOf = new Map(variants.map((v) => [v.id, { sku: v.sku, name: `${v.product.name} · ${v.name}` }]));

      return [...acc.entries()]
        .map(([variantId, r]) => {
          const profit = r.revenue.minus(r.cogs);
          const info = nameOf.get(variantId);
          return {
            variantId,
            sku: info?.sku ?? null,
            name: info?.name ?? null,
            quantity: r.qty.toString(),
            revenue: r.revenue.toString(),
            cogs: r.cogs.toString(),
            grossProfit: profit.toString(),
            margin: r.revenue.gt(0) ? profit.dividedBy(r.revenue).toString() : "0",
            _sort: Number(profit),
          };
        })
        .sort((a, b) => b._sort - a._sort)
        .slice(0, 50)
        .map(({ _sort, ...row }) => row);
    });
  }

  // Corte de caja de una sesión: desglose por método, movimientos y arqueo.
  async cashCut(organizationId: string, sessionId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id: sessionId },
        include: { movements: { orderBy: { createdAt: "asc" } } },
      });
      if (!session) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");

      const pays = await tx.payment.findMany({
        where: { cashSessionId: sessionId, status: "COMPLETED" },
        select: { method: true, amount: true },
      });
      const byMethod = this.byMethodTemplate();
      for (const p of pays) byMethod[p.method] = byMethod[p.method].plus(p.amount);

      let deposits = ZERO;
      let withdrawals = ZERO;
      let expenses = ZERO;
      for (const m of session.movements) {
        if (m.type === "DEPOSIT") deposits = deposits.plus(m.amount);
        else if (m.type === "WITHDRAWAL") withdrawals = withdrawals.plus(m.amount);
        else expenses = expenses.plus(m.amount);
      }

      const openingFloat = new Prisma.Decimal(session.openingFloat);
      const cashSales = byMethod.CASH;
      const expectedCash =
        session.status === "OPEN"
          ? openingFloat.plus(cashSales).plus(deposits).minus(withdrawals).minus(expenses)
          : new Prisma.Decimal(session.expectedCash ?? 0);

      return {
        sessionId: session.id,
        registerId: session.registerId,
        status: session.status,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
        openingFloat: openingFloat.toString(),
        salesByMethod: Object.fromEntries(METHODS.map((m) => [m, byMethod[m].toString()])),
        totalSales: METHODS.reduce((s, m) => s.plus(byMethod[m]), ZERO).toString(),
        cashMovements: { deposits: deposits.toString(), withdrawals: withdrawals.toString(), expenses: expenses.toString() },
        expectedCash: expectedCash.toString(),
        countedCash: session.countedCash?.toString() ?? null,
        difference: session.difference?.toString() ?? null,
        movements: session.movements.map((m) => ({ id: m.id, type: m.type, amount: m.amount.toString(), reason: m.reason, createdAt: m.createdAt.toISOString() })),
      };
    });
  }
}
