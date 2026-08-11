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
import { BalanceService } from "../src/inventory/balance.service.js";
import { LedgerService } from "../src/inventory/ledger.service.js";
import { CostService } from "../src/inventory/cost.service.js";
import { ReservationService } from "../src/inventory/reservation.service.js";
import { InventoryService } from "../src/inventory/inventory.service.js";
import { OrderService } from "../src/sales/order.service.js";
import { PaymentService } from "../src/cash/payment.service.js";
import { SaleNoteService } from "../src/sales/sale-note.service.js";

const prisma: ExtendedPrismaClient = createPrismaClient();
const prismaService = {
  client: prisma,
  withTenant: (org: string, fn: never) => withTenant(prisma, org, fn),
  withSystem: (fn: never) => withSystem(prisma, fn),
} as unknown as PrismaService;
const audit = { record: async () => undefined } as unknown as AuditService;

const balances = new BalanceService();
const ledger = new LedgerService(balances);
const cost = new CostService();
const reservations = new ReservationService(prismaService, balances, ledger, audit);
const inventory = new InventoryService(prismaService, ledger, cost, balances, audit);
const orders = new OrderService(prismaService, ledger, cost, balances, reservations, audit);
const payments = new PaymentService(prismaService, audit);
const notes = new SaleNoteService(prismaService, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

async function fulfilledOrder(unitPrice = 100, qty = 2): Promise<string> {
  const variantId = await withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "Prod", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 100, unitCost: 60 });
  const order = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId, quantity: qty, unitPrice, discount: 0, taxRate: 0 }] });
  await orders.confirm(orgId, userId, order.id);
  await orders.fulfill(orgId, userId, order.id);
  return order.id;
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Note", slug: `note-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `note-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.saleNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNote.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
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

describe("Notas de venta — comprobante inmutable + folio consecutivo (ADR-024)", () => {
  it("emite con snapshot de totales, renglones y neto cobrado", async () => {
    const orderId = await fulfilledOrder(100, 2); // total 200
    await payments.record(orgId, userId, { orderId, method: "CARD", amount: 150 });

    const note = await notes.issue(orgId, userId, { orderId, series: "A" });
    expect(note.number).toBe("A-000001");
    expect(note.total.toString()).toBe("200");
    expect(note.paidTotal.toString()).toBe("150");
    expect(note.items).toHaveLength(1);
    expect(note.items[0]!.description).toContain("·");
    expect(note.items[0]!.lineTotal.toString()).toBe("200");
  });

  it("no permite emitir dos notas ISSUED para el mismo pedido", async () => {
    const orderId = await fulfilledOrder();
    await notes.issue(orgId, userId, { orderId, series: "A" });
    await expect(notes.issue(orgId, userId, { orderId, series: "A" })).rejects.toMatchObject({ code: "SALE_NOTE_ALREADY_ISSUED" });
  });

  it("no emite para un pedido en DRAFT", async () => {
    const variantId = await withSystem(prisma, async (tx) => {
      const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
      const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
      return v.id;
    });
    const draft = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId, quantity: 1, unitPrice: 10, discount: 0, taxRate: 0 }] });
    await expect(notes.issue(orgId, userId, { orderId: draft.id, series: "A" })).rejects.toMatchObject({ code: "SALE_NOTE_INVALID_STATE" });
  });

  it("cancelar libera la reemisión con nuevo folio; no se cancela dos veces", async () => {
    const orderId = await fulfilledOrder();
    const first = await notes.issue(orgId, userId, { orderId, series: "B" });
    const cancelled = await notes.cancel(orgId, userId, first.id, { reason: "Error de captura" });
    expect(cancelled.status).toBe("CANCELLED");
    await expect(notes.cancel(orgId, userId, first.id, { reason: "otra" })).rejects.toMatchObject({ code: "SALE_NOTE_INVALID_STATE" });

    const reissued = await notes.issue(orgId, userId, { orderId, series: "B" });
    expect(reissued.folio).toBeGreaterThan(first.folio);
  });

  it("folios concurrentes de la misma serie son únicos y consecutivos", async () => {
    const [a, b] = await Promise.all([fulfilledOrder(), fulfilledOrder()]);
    const [na, nb] = await Promise.all([
      notes.issue(orgId, userId, { orderId: a, series: "C" }),
      notes.issue(orgId, userId, { orderId: b, series: "C" }),
    ]);
    const folios = [na.folio, nb.folio].sort((x, y) => x - y);
    expect(folios[1]! - folios[0]!).toBe(1); // consecutivos, sin colisión
    expect(new Set(folios).size).toBe(2);
  });
});
