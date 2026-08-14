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
import { SaleNoteService } from "../src/sales/sale-note.service.js";
import { CreditNoteService } from "../src/sales/credit-note.service.js";
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
const saleNotes = new SaleNoteService(prismaService, audit);
const creditNotes = new CreditNoteService(prismaService, ledger, cost, audit);
const reports = new ReportsService(prismaService, permAllow);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let v1: string; // marca A, sabor X
let v2: string; // marca B, sabor Y

async function sell(variantId: string, qty: number) {
  const o = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId, quantity: qty, unitPrice: 100, discount: 0, taxRate: 0 }] });
  await orders.confirm(orgId, userId, o.id);
  await orders.fulfill(orgId, userId, o.id);
  const note = await saleNotes.issue(orgId, userId, { orderId: o.id, series: "A" });
  return note;
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Top", slug: `top-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `top-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;

    const brandA = await tx.brand.create({ data: { organizationId: orgId, name: "Marca A", slug: `a-${suffix}` } });
    const brandB = await tx.brand.create({ data: { organizationId: orgId, name: "Marca B", slug: `b-${suffix}` } });
    const flavorX = await tx.flavor.create({ data: { organizationId: orgId, name: "Blue Razz", normalizedName: `blue-razz-${suffix}` } });
    const flavorY = await tx.flavor.create({ data: { organizationId: orgId, name: "Mint", normalizedName: `mint-${suffix}` } });

    const p1 = await tx.product.create({ data: { organizationId: orgId, name: "Modelo 1", slug: `p1-${randomUUID()}`, status: "ACTIVE", brandId: brandA.id } });
    const p2 = await tx.product.create({ data: { organizationId: orgId, name: "Modelo 2", slug: `p2-${randomUUID()}`, status: "ACTIVE", brandId: brandB.id } });
    const vv1 = await tx.productVariant.create({ data: { organizationId: orgId, productId: p1.id, flavorId: flavorX.id, sku: `S1-${randomUUID()}`, name: "M1/X", purchaseUnitId: unitId, salesUnitId: unitId } });
    const vv2 = await tx.productVariant.create({ data: { organizationId: orgId, productId: p2.id, flavorId: flavorY.id, sku: `S2-${randomUUID()}`, name: "M2/Y", purchaseUnitId: unitId, salesUnitId: unitId } });
    v1 = vv1.id; v2 = vv2.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v1, quantity: 100, unitCost: 40 });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v2, quantity: 100, unitCost: 40 });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.creditNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.creditNote.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNote.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryReservation.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.flavor.deleteMany({ where: { organizationId: orgId } });
    await tx.brand.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

type Row = { key: string; label: string; sublabel: string | null; units: string; returnedUnits: string; grossProfit?: string };

describe("Análisis de más vendidos (modelos/marcas/sabores) + devoluciones", () => {
  it("agrega ventas y devoluciones por modelo, marca y sabor", async () => {
    const n1 = await sell(v1, 5); // Modelo 1 / Marca A / Blue Razz
    await sell(v2, 3); // Modelo 2 / Marca B / Mint
    // Devuelve 2 del Modelo 1.
    await creditNotes.issue(orgId, userId, { saleNoteId: n1.id, series: "NC", reason: "defecto", items: [{ saleNoteItemId: n1.items[0]!.id, quantity: 2 }] });

    // Por MODELO
    const prod = await reports.topSellers(orgId, { dimension: "product" }, "m") as { rows: Row[] };
    const m1 = prod.rows.find((r) => r.label === "Modelo 1")!;
    const m2 = prod.rows.find((r) => r.label === "Modelo 2")!;
    expect(m1.units).toBe("5");
    expect(m1.returnedUnits).toBe("2");
    expect(m1.grossProfit).toBe("300"); // (100-40)*5
    expect(m2.units).toBe("3");
    expect(prod.rows[0]!.label).toBe("Modelo 1"); // más vendido primero

    // Por MARCA
    const brand = await reports.topSellers(orgId, { dimension: "brand" }, "m") as { rows: Row[] };
    expect(brand.rows.find((r) => r.label === "Marca A")!.units).toBe("5");
    expect(brand.rows.find((r) => r.label === "Marca B")!.units).toBe("3");

    // Por SABOR
    const flavor = await reports.topSellers(orgId, { dimension: "flavor" }, "m") as { rows: Row[] };
    expect(flavor.rows.find((r) => r.label === "Blue Razz")!.units).toBe("5");
    expect(flavor.rows.find((r) => r.label === "Mint")!.units).toBe("3");
  });

  it("ordena por devoluciones (marcas con más problemas)", async () => {
    const byReturns = await reports.topSellers(orgId, { dimension: "brand", sort: "returns" }, "m") as { rows: Row[] };
    expect(byReturns.rows[0]!.label).toBe("Marca A"); // la de más devoluciones
    expect(byReturns.rows[0]!.returnedUnits).toBe("2");
  });
});
