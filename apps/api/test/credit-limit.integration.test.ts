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
import { PaymentService } from "../src/cash/payment.service.js";
import { PosService } from "../src/sales/pos.service.js";

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
const payments = new PaymentService(prismaService, audit);
const pos = new PosService(prismaService, orders, payments, saleNotes, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

async function variant(): Promise<string> {
  const id = await withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId: id, quantity: 100, unitCost: 10 });
  return id;
}
async function draft(customer: string, total: number): Promise<string> {
  const v = await variant();
  const o = await orders.create(orgId, userId, { warehouseId, customerId: customer, currency: "MXN", items: [{ variantId: v, quantity: 1, unitPrice: total, discount: 0, taxRate: 0 }] });
  return o.id;
}
// Cliente fresco por caso (evita que el saldo cruce entre tests).
async function mkCustomer(creditLimit: number | null): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const c = await tx.customer.create({ data: { organizationId: orgId, name: `C-${randomUUID().slice(0, 6)}`, type: "WHOLESALE", creditLimit, status: "ACTIVE" } });
    return c.id;
  });
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Cl", slug: `cl-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `cl-${suffix}@example.local`, passwordHash: "x" } });
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

describe("Límite de crédito (Fase 3)", () => {
  it("bloquea al superar el límite; pagar libera crédito", async () => {
    const cust = await mkCustomer(200);
    const a = await draft(cust, 200);
    await orders.confirm(orgId, userId, a); // saldo 0 + 200 = 200 ≤ 200 → OK

    const b = await draft(cust, 50);
    // saldo 200 (A comprometido) + 50 = 250 > 200 → bloqueado
    await expect(orders.confirm(orgId, userId, b)).rejects.toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED" });

    // Pagar A completo → saldo 0.
    await payments.record(orgId, userId, { orderId: a, method: "CARD", amount: 200 });
    // Ahora B sí entra: saldo 0 + 50 = 50 ≤ 200.
    const confirmed = await orders.confirm(orgId, userId, b);
    expect(confirmed.status).toBe("CONFIRMED");
  });

  it("cliente sin límite nunca se bloquea", async () => {
    const cust = await mkCustomer(null);
    const o = await draft(cust, 100000);
    const confirmed = await orders.confirm(orgId, userId, o);
    expect(confirmed.status).toBe("CONFIRMED");
  });

  it("el POS no aplica el límite (cobra el total en el acto)", async () => {
    const cust = await mkCustomer(200);
    // Deja al cliente justo en el límite con un pedido a crédito.
    const c = await draft(cust, 200);
    await orders.confirm(orgId, userId, c); // saldo → 200 (en el límite)

    // Una venta POS de 50 al mismo cliente debe pasar (paga completo, no extiende crédito).
    const v = await variant();
    const res = await pos.sale(orgId, userId, {
      warehouseId, customerId: cust, currency: "MXN",
      items: [{ variantId: v, quantity: 1, unitPrice: 50, discount: 0 }],
      payment: { method: "CARD" },
      issueSaleNote: false,
    });
    expect(res.order.status).toBe("COMPLETED");
  });
});
