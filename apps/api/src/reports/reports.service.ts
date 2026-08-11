import { Injectable } from "@nestjs/common";
import { Prisma, type PaymentMethod, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { PermissionService } from "../iam/permission.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import type { ReportRangeInput } from "./reports.dto.js";

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
