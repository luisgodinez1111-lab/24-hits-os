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
import { CustomerService } from "../src/sales/customer.service.js";
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

const balances = new BalanceService();
const ledger = new LedgerService(balances);
const cost = new CostService();
const reservations = new ReservationService(prismaService, balances, ledger, audit);
const inventory = new InventoryService(prismaService, ledger, cost, balances, audit);
const orders = new OrderService(prismaService, ledger, cost, balances, reservations, audit);
const saleNotes = new SaleNoteService(prismaService, audit);
const creditNotes = new CreditNoteService(prismaService, ledger, cost, audit);
const payments = new PaymentService(prismaService, audit);
const customers = new CustomerService(prismaService, audit);
const reports = new ReportsService(prismaService, permAllow);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let customerId: string;

async function variant(): Promise<string> {
  const id = await withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId: id, quantity: 50, unitCost: 60 });
  return id;
}
async function soldNote(qty: number, price: number) {
  const v = await variant();
  const order = await orders.create(orgId, userId, { warehouseId, customerId, currency: "MXN", items: [{ variantId: v, quantity: qty, unitPrice: price, discount: 0, taxRate: 0 }] });
  await orders.confirm(orgId, userId, order.id);
  await orders.fulfill(orgId, userId, order.id);
  const note = await saleNotes.issue(orgId, userId, { orderId: order.id, series: "A" });
  return { orderId: order.id, note };
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Acc", slug: `acc-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `acc-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const c = await tx.customer.create({ data: { organizationId: orgId, name: "Mayorista", type: "WHOLESALE", creditLimit: 5000, status: "ACTIVE" } });
    customerId = c.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.creditNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.creditNote.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNote.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.customer.deleteMany({ where: { organizationId: orgId } });
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

describe("Estado de cuenta del cliente + reflejo de notas de crédito (Fase 2)", () => {
  it("saldo = comprado − pagado − crédito a favor; el reembolsado no cuenta como favor", async () => {
    // Pedido A: 2 @ 100 = 200, pagado completo.
    const a = await soldNote(2, 100);
    await payments.record(orgId, userId, { orderId: a.orderId, method: "CARD", amount: 200 });
    // Pedido B: 1 @ 100 = 100, sin pagar (a crédito).
    const b = await soldNote(1, 100);

    // Devolución en A: 1 unidad (crédito 100), SIN reembolso → crédito a favor.
    await creditNotes.issue(orgId, userId, { saleNoteId: a.note.id, series: "NC", reason: "defectuoso", items: [{ saleNoteItemId: a.note.items[0]!.id, quantity: 1 }] });

    let acc = await customers.account(orgId, customerId);
    expect(acc.summary.charges).toBe("300"); // 200 + 100
    expect(acc.summary.paid).toBe("200");
    expect(acc.summary.credited).toBe("100");
    expect(acc.summary.creditInFavor).toBe("100");
    expect(acc.summary.balance).toBe("0"); // 300 - 200 - 100
    expect(acc.creditAvailable).toBe("5000"); // 5000 - 0

    // Devolución en B: 1 unidad (crédito 100) CON reembolso en tarjeta → NO es crédito a favor.
    await creditNotes.issue(orgId, userId, { saleNoteId: b.note.id, series: "NC", reason: "cambio", refundMethod: "CARD", items: [{ saleNoteItemId: b.note.items[0]!.id, quantity: 1 }] });

    acc = await customers.account(orgId, customerId);
    expect(acc.summary.credited).toBe("200"); // 100 + 100
    expect(acc.summary.creditInFavor).toBe("100"); // solo el de A (sin reembolso)
    expect(acc.summary.balance).toBe("0"); // 300 - 200 - 100
  });

  it("el registro de ventas refleja lo devuelto por pedido", async () => {
    const reg = await reports.salesRegister(orgId, {}, "m") as { rows: Array<Record<string, unknown>>; totals: Record<string, unknown> };
    const withCredit = reg.rows.filter((r) => Number(r.credited) > 0);
    expect(withCredit.length).toBeGreaterThanOrEqual(2);
    expect(reg.totals.credited).toBe("200");
  });
});
