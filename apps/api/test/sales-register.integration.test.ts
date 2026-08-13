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
const saleNotes = new SaleNoteService(prismaService, audit);
const payments = new PaymentService(prismaService, audit);
const reportsFull = new ReportsService(prismaService, permAllow);
const reportsBasic = new ReportsService(prismaService, permDeny);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

async function variantWithStock(unitCost = 60): Promise<string> {
  const variantId = await withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 50, unitCost });
  return variantId;
}
const statusOf = (id: string) => withTenant(prisma, orgId, (tx) => tx.order.findFirst({ where: { id }, select: { status: true, paymentStatus: true } }));

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Reg", slug: `reg-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `reg-${suffix}@example.local`, passwordHash: "x" } });
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

describe("Registro de ventas + cierre del pedido (Fase 1)", () => {
  it("entregar y luego cobrar completo → COMPLETED; el registro une pedido+pago+nota+COGS", async () => {
    const v = await variantWithStock(60);
    const order = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId: v, quantity: 2, unitPrice: 100, discount: 0, taxRate: 0 }] });
    await orders.confirm(orgId, userId, order.id);
    await orders.fulfill(orgId, userId, order.id);
    expect((await statusOf(order.id))?.status).toBe("FULFILLED"); // entregado, sin pagar

    await payments.record(orgId, userId, { orderId: order.id, method: "CARD", amount: 200 });
    const st = await statusOf(order.id);
    expect(st?.status).toBe("COMPLETED"); // saldado + entregado → cerrado
    expect(st?.paymentStatus).toBe("PAID");

    const note = await saleNotes.issue(orgId, userId, { orderId: order.id, series: "A" });

    const reg = await reportsFull.salesRegister(orgId, {}, "m") as { rows: Array<Record<string, unknown>>; totals: Record<string, unknown> };
    const row = reg.rows.find((r) => r.orderId === order.id)!;
    expect(row.total).toBe("200");
    expect(row.paid).toBe("200");
    expect(row.balance).toBe("0");
    expect(row.status).toBe("COMPLETED");
    expect(row.methods).toEqual(["CARD"]);
    expect(row.saleNoteNumber).toBe(note.number);
    expect(row.cogs).toBe("120"); // 2 * 60
    expect(row.grossProfit).toBe("80"); // 200 - 120
  });

  it("cobrar completo antes de entregar; al entregar → COMPLETED", async () => {
    const v = await variantWithStock(60);
    const order = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId: v, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }] });
    await orders.confirm(orgId, userId, order.id);
    await payments.record(orgId, userId, { orderId: order.id, method: "TRANSFER", amount: 100 });
    expect((await statusOf(order.id))?.status).toBe("CONFIRMED"); // pagado pero no entregado
    await orders.fulfill(orgId, userId, order.id);
    expect((await statusOf(order.id))?.status).toBe("COMPLETED"); // entrega cierra la venta
  });

  it("pago parcial no cierra; balance refleja el saldo", async () => {
    const v = await variantWithStock(60);
    const order = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId: v, quantity: 2, unitPrice: 100, discount: 0, taxRate: 0 }] });
    await orders.confirm(orgId, userId, order.id);
    await orders.fulfill(orgId, userId, order.id);
    await payments.record(orgId, userId, { orderId: order.id, method: "CARD", amount: 100 });
    const st = await statusOf(order.id);
    expect(st?.status).toBe("FULFILLED"); // no cierra
    expect(st?.paymentStatus).toBe("PARTIAL");

    const reg = await reportsFull.salesRegister(orgId, { customerId: undefined }, "m") as { rows: Array<Record<string, unknown>> };
    const row = reg.rows.find((r) => r.orderId === order.id)!;
    expect(row.balance).toBe("100");
  });

  it("anular el pago reabre el pedido (COMPLETED → FULFILLED)", async () => {
    const v = await variantWithStock(60);
    const order = await orders.create(orgId, userId, { warehouseId, currency: "MXN", items: [{ variantId: v, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }] });
    await orders.confirm(orgId, userId, order.id);
    await orders.fulfill(orgId, userId, order.id);
    const pay = await payments.record(orgId, userId, { orderId: order.id, method: "CARD", amount: 100 });
    expect((await statusOf(order.id))?.status).toBe("COMPLETED");

    await payments.reverse(orgId, userId, pay.id);
    const st = await statusOf(order.id);
    expect(st?.status).toBe("FULFILLED"); // reabre
    expect(st?.paymentStatus).toBe("PENDING");
  });

  it("el registro oculta costo/utilidad sin profits.read", async () => {
    const reg = await reportsBasic.salesRegister(orgId, {}, "m") as { rows: Array<Record<string, unknown>>; totals: Record<string, unknown> };
    expect(reg.rows.length).toBeGreaterThan(0);
    expect(reg.rows[0]!.cogs).toBeUndefined();
    expect(reg.totals.grossProfit).toBeUndefined();
    expect(reg.totals.billed).toBeTruthy();
  });
});
