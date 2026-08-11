import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withSystem,
  withTenant,
  type ExtendedPrismaClient,
} from "@24hits/database";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { AuditService } from "../src/audit/audit.service.js";
import type { PermissionService } from "../src/iam/permission.service.js";
import { BalanceService } from "../src/inventory/balance.service.js";
import { LedgerService } from "../src/inventory/ledger.service.js";
import { CostService } from "../src/inventory/cost.service.js";
import { ReservationService } from "../src/inventory/reservation.service.js";
import { InventoryService } from "../src/inventory/inventory.service.js";
import { OrderService } from "../src/sales/order.service.js";
import { CashService } from "../src/cash/cash.service.js";
import { PaymentService } from "../src/cash/payment.service.js";
import { ReportsService } from "../src/reports/reports.service.js";

const prisma: ExtendedPrismaClient = createPrismaClient();
const prismaService = {
  client: prisma,
  withTenant: (org: string, fn: never) => withTenant(prisma, org, fn),
  withSystem: (fn: never) => withSystem(prisma, fn),
} as unknown as PrismaService;
const audit = { record: async () => undefined } as unknown as AuditService;
const permAllow = { can: async () => true } as unknown as PermissionService;
const permDeny = { can: async () => false } as unknown as PermissionService;

const balances = new BalanceService();
const ledger = new LedgerService(balances);
const cost = new CostService();
const reservations = new ReservationService(prismaService, balances, ledger, audit);
const inventory = new InventoryService(prismaService, ledger, cost, balances, audit);
const orders = new OrderService(prismaService, ledger, cost, balances, reservations, audit);
const cash = new CashService(prismaService, audit);
const payments = new PaymentService(prismaService, audit);
const reportsFull = new ReportsService(prismaService, permAllow);
const reportsBasic = new ReportsService(prismaService, permDeny);

const suffix = Date.now().toString(36);
let orgId: string;
let branchId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Rep", slug: `rep-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    branchId = branch.id;
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `rep-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.cashMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.cashSession.deleteMany({ where: { organizationId: orgId } });
    await tx.cashRegister.deleteMany({ where: { organizationId: orgId } });
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryReservation.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

describe("Reportes financieros — KPIs, utilidad y corte (Prompt 6)", () => {
  it("venta entregada + cobros: KPIs, utilidad y corte de caja cuadran", async () => {
    // Producto con existencia y costo 100.
    const variantId = await withSystem(prisma, async (tx) => {
      const p = await tx.product.create({ data: { organizationId: orgId, name: "Prod A", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
      const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
      return v.id;
    });
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 10, unitCost: 100 });

    // Pedido 3 @ 150 = 450 → confirmar → entregar (COGS 100/u).
    const order = await orders.create(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [{ variantId, quantity: 3, unitPrice: 150, discount: 0, taxRate: 0 }],
    });
    await orders.confirm(orgId, userId, order.id);
    await orders.fulfill(orgId, userId, order.id);

    // Caja: abrir, cobrar 200 efectivo + 250 tarjeta (= 450).
    const reg = await cash.createRegister(orgId, { branchId, name: "Caja R", code: `CR-${suffix}` });
    const session = await cash.open(orgId, userId, { registerId: reg.id, openingFloat: 0 });
    await payments.record(orgId, userId, { orderId: order.id, method: "CASH", amount: 200, cashSessionId: session.id });
    await payments.record(orgId, userId, { orderId: order.id, method: "CARD", amount: 250, cashSessionId: session.id });

    // --- KPIs con utilidad (profits.read) ---
    const full = await reportsFull.salesSummary(orgId, {}, "member-x") as Record<string, string>;
    expect(full.billed).toBe("450");
    expect(full.collected).toBe("450");
    expect(full.outstanding).toBe("0");
    expect(full.cogs).toBe("300");
    expect(full.grossProfit).toBe("150");
    expect(full.revenueNet).toBe("450");

    // --- KPIs sin utilidad: no expone costo/utilidad ---
    const basic = await reportsBasic.salesSummary(orgId, {}, "member-x") as Record<string, unknown>;
    expect(basic.billed).toBe("450");
    expect(basic.cogs).toBeUndefined();
    expect(basic.grossProfit).toBeUndefined();

    // --- Utilidad por producto ---
    const byProduct = await reportsFull.profitByProduct(orgId, {});
    expect(byProduct).toHaveLength(1);
    expect(byProduct[0]!.quantity).toBe("3");
    expect(byProduct[0]!.grossProfit).toBe("150");
    expect(byProduct[0]!.sku).toBeTruthy();

    // --- Corte de caja ---
    const cut = await reportsFull.cashCut(orgId, session.id);
    expect(cut.salesByMethod.CASH).toBe("200");
    expect(cut.salesByMethod.CARD).toBe("250");
    expect(cut.totalSales).toBe("450");
    expect(cut.expectedCash).toBe("200"); // fondo 0 + efectivo 200
  });

  it("filtro por sucursal inexistente devuelve cero", async () => {
    const empty = await reportsFull.salesSummary(orgId, { branchId: randomUUID() }, "member-x") as Record<string, string>;
    expect(empty.billed).toBe("0");
    expect(empty.collected).toBe("0");
    expect(empty.grossProfit).toBe("0");
  });
});
