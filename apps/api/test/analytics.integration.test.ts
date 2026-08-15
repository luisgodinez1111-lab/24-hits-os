import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withSystem, withTenant, type ExtendedPrismaClient } from "@24hits/database";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { AuditService } from "../src/audit/audit.service.js";
import type { PermissionService } from "../src/iam/permission.service.js";
import { BalanceService } from "../src/inventory/balance.service.js";
import { LedgerService } from "../src/inventory/ledger.service.js";
import { CostService } from "../src/inventory/cost.service.js";
import { ReservationService } from "../src/inventory/reservation.service.js";
import { InventoryService } from "../src/inventory/inventory.service.js";
import { OrderService } from "../src/sales/order.service.js";
import { CustomerService } from "../src/sales/customer.service.js";
import { ReportsService } from "../src/reports/reports.service.js";

const prisma: ExtendedPrismaClient = createPrismaClient();
const prismaService = {
  client: prisma,
  withTenant: (org: string, fn: never) => withTenant(prisma, org, fn),
  withSystem: (fn: never) => withSystem(prisma, fn),
} as unknown as PrismaService;
const audit = { record: async () => undefined } as unknown as AuditService;
const permAllow = { can: async () => true } as unknown as PermissionService;

const balances = new BalanceService();
const ledger = new LedgerService(balances);
const cost = new CostService();
const reservations = new ReservationService(prismaService, balances, ledger, audit);
const inventory = new InventoryService(prismaService, ledger, cost, balances, audit);
const orders = new OrderService(prismaService, ledger, cost, balances, reservations, audit);
const customers = new CustomerService(prismaService, audit);
const reports = new ReportsService(prismaService, permAllow);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let variantId: string;

async function fulfilled(customerId: string | undefined, qty: number, price: number) {
  const order = await orders.create(orgId, userId, { warehouseId, customerId, currency: "MXN", items: [{ variantId, quantity: qty, unitPrice: price, discount: 0, taxRate: 0 }] });
  await orders.confirm(orgId, userId, order.id);
  await orders.fulfill(orgId, userId, order.id);
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "An", slug: `an-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `an-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const p = await tx.product.create({ data: { organizationId: orgId, name: "Modelo", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    variantId = v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 1000, unitCost: 40 });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.customer.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
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

describe("Analítica: serie temporal + ventas por zona", () => {
  it("serie diaria: agrega mercancía vendida y utilidad por día", async () => {
    const norte = await customers.create(orgId, { name: "Norte", type: "RETAIL", zone: "NORTE" });
    await fulfilled(norte.id, 3, 100); // billed 300, cogs 120 → profit 180
    await fulfilled(norte.id, 2, 100); // billed 200, cogs 80  → profit 120

    const ts = await reports.salesTimeseries(orgId, { granularity: "day" }, "m");
    expect(ts.granularity).toBe("day");
    const total = ts.points.reduce((s, p) => s + Number(p.billed), 0);
    expect(total).toBe(500);
    const units = ts.points.reduce((s, p) => s + Number(p.units), 0);
    expect(units).toBe(5);
    // Con profits.read la utilidad viene incluida.
    const profit = ts.points.reduce((s, p) => s + Number((p as { grossProfit?: string }).grossProfit ?? 0), 0);
    expect(profit).toBe(300); // 180 + 120
  });

  it("por zona: ordena por venta y separa la zona sin cliente", async () => {
    const sur = await customers.create(orgId, { name: "Sur", type: "RETAIL", zone: "SUR" });
    await fulfilled(sur.id, 1, 50); // SUR billed 50
    await fulfilled(undefined, 1, 10); // mostrador → SIN_ZONA billed 10

    const byZone = await reports.salesByZone(orgId, {}, "m");
    const norte = byZone.rows.find((r) => r.zone === "NORTE");
    const surRow = byZone.rows.find((r) => r.zone === "SUR");
    const sin = byZone.rows.find((r) => r.zone === "SIN_ZONA");
    expect(norte?.billed).toBe("500");
    expect(surRow?.billed).toBe("50");
    expect(sin?.billed).toBe("10");
    // Orden descendente por venta: NORTE primero.
    expect(byZone.rows[0]!.zone).toBe("NORTE");
  });
});
