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
import { SaleNoteService } from "../src/sales/sale-note.service.js";
import { CreditNoteService } from "../src/sales/credit-note.service.js";
import { CashService } from "../src/cash/cash.service.js";

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
const saleNotes = new SaleNoteService(prismaService, audit);
const creditNotes = new CreditNoteService(prismaService, ledger, cost, audit);
const cash = new CashService(prismaService, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let branchId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

// Venta completa 'qty @ unitPrice' entregada + nota de venta. Devuelve { note, variantId }.
async function soldNote(unitPrice: number, qty: number) {
  const variantId = await withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "Prod", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 10, unitCost: 100 });
  const order = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId, quantity: qty, unitPrice, discount: 0, taxRate: 0 }] });
  await orders.confirm(orgId, userId, order.id);
  await orders.fulfill(orgId, userId, order.id);
  const note = await saleNotes.issue(orgId, userId, { orderId: order.id, series: "A" });
  return { note, variantId };
}
const balanceOf = (variantId: string) => withTenant(prisma, orgId, (tx) => tx.inventoryBalance.findFirst({ where: { warehouseId, variantId } }));
const costOf = (variantId: string) => withTenant(prisma, orgId, (tx) => tx.variantCost.findUnique({ where: { variantId } }));

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Cred", slug: `cred-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    branchId = branch.id;
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `cred-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.creditNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.creditNote.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNote.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
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

describe("Devoluciones / notas de crédito (ADR-025)", () => {
  it("reingresa inventario, revierte COGS y documenta el crédito", async () => {
    const { note, variantId } = await soldNote(150, 3); // vendió 3, onHand 7, costo qty 7
    const itemId = note.items[0]!.id;

    const credit = await creditNotes.issue(orgId, userId, {
      saleNoteId: note.id, series: "NC", reason: "Producto defectuoso",
      items: [{ saleNoteItemId: itemId, quantity: 2 }],
    });

    expect(credit.number).toBe("NC-000001");
    expect(credit.total.toString()).toBe("300"); // 150 * 2
    expect(credit.items[0]!.unitCostSnapshot?.toString()).toBe("100");

    // Inventario reingresado: 7 → 9.
    expect((await balanceOf(variantId))?.onHand.toString()).toBe("9");
    // COGS revertido: base de cantidad del promedio 7 → 9, promedio intacto (100).
    const c = await costOf(variantId);
    expect(c?.quantityOnHand.toString()).toBe("9");
    expect(c?.averageCost.toString()).toBe("100");

    // Movimiento CUSTOMER_RETURN registrado con el costo capturado.
    const mv = await withTenant(prisma, orgId, (tx) => tx.inventoryMovement.findFirst({ where: { variantId, movementType: "CUSTOMER_RETURN" } }));
    expect(mv?.unitCost?.toString()).toBe("100");
  });

  it("no permite devolver más de lo vendido (acumulado)", async () => {
    const { note } = await soldNote(100, 3);
    const itemId = note.items[0]!.id;
    await creditNotes.issue(orgId, userId, { saleNoteId: note.id, series: "NC", reason: "parcial", items: [{ saleNoteItemId: itemId, quantity: 2 }] });
    await expect(creditNotes.issue(orgId, userId, { saleNoteId: note.id, series: "NC", reason: "excede", items: [{ saleNoteItemId: itemId, quantity: 2 }] }))
      .rejects.toMatchObject({ code: "RETURN_EXCEEDS_SOLD" });
  });

  it("reembolso en efectivo retira del cajón (WITHDRAWAL)", async () => {
    const { note } = await soldNote(200, 1); // total línea 200
    const itemId = note.items[0]!.id;
    const reg = await cash.createRegister(orgId, { branchId, name: "Caja CN", code: `CN-${suffix}` });
    const session = await cash.open(orgId, userId, { registerId: reg.id, openingFloat: 500 });

    await creditNotes.issue(orgId, userId, {
      saleNoteId: note.id, series: "NC", reason: "reembolso",
      refundMethod: "CASH", refundCashSessionId: session.id,
      items: [{ saleNoteItemId: itemId, quantity: 1 }],
    });

    // Esperado = fondo 500 − reembolso 200 = 300.
    const cut = await cash.getSession(orgId, session.id);
    expect(cut.expectedCashLive).toBe("300");
    const wd = await withTenant(prisma, orgId, (tx) => tx.cashMovement.findFirst({ where: { cashSessionId: session.id, type: "WITHDRAWAL" } }));
    expect(wd?.amount.toString()).toBe("200");
  });

  it("folios NC consecutivos por serie", async () => {
    const { note: n1 } = await soldNote(100, 1);
    const { note: n2 } = await soldNote(100, 1);
    const c1 = await creditNotes.issue(orgId, userId, { saleNoteId: n1.id, series: "NC", reason: "x", items: [{ saleNoteItemId: n1.items[0]!.id, quantity: 1 }] });
    const c2 = await creditNotes.issue(orgId, userId, { saleNoteId: n2.id, series: "NC", reason: "y", items: [{ saleNoteItemId: n2.items[0]!.id, quantity: 1 }] });
    expect(c2.folio - c1.folio).toBe(1);
  });
});
