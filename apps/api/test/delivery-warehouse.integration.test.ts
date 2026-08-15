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

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string; // con almacén fijo
let strangerId: string; // sin membresía
let variantId: string;

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Del", slug: `del-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "Almacén Luis", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `del-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const stranger = await tx.user.create({ data: { email: `strg-${suffix}@example.local`, passwordHash: "x" } });
    strangerId = stranger.id;
    // Membresía con almacén fijo.
    await tx.organizationMembership.create({ data: { organizationId: orgId, userId, status: "ACTIVE", defaultWarehouseId: warehouseId } });
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    variantId = v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 100, unitCost: 10 });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
    await tx.user.delete({ where: { id: strangerId } });
  });
  await prisma.$disconnect();
});

describe("Almacén fijo por usuario + entrega a domicilio", () => {
  it("crea el pedido usando el almacén fijo del usuario (sin indicarlo) y guarda la entrega", async () => {
    const order = await orders.create(orgId, userId, {
      currency: "MXN",
      deliveryAddress: "Calle 24 #100, Col. Centro",
      deliveryPhone: "6141234567",
      deliveryLocationUrl: "https://maps.google.com/?q=28.6,-106.0",
      items: [{ variantId, quantity: 2, unitPrice: 150, discount: 0, taxRate: 0 }],
    });
    expect(order.warehouseId).toBe(warehouseId); // resuelto de la membresía
    expect(order.deliveryAddress).toBe("Calle 24 #100, Col. Centro");
    expect(order.deliveryStatus).toBe("PENDING");
  });

  it("actualiza el estado de entrega", async () => {
    const order = await orders.create(orgId, userId, {
      currency: "MXN", deliveryAddress: "Dom", items: [{ variantId, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }],
    });
    const updated = await orders.updateDelivery(orgId, order.id, { status: "DELIVERED", deliveryNotes: "Entregado a portería" });
    expect(updated.deliveryStatus).toBe("DELIVERED");
    expect(updated.deliveryNotes).toBe("Entregado a portería");
  });

  it("sin almacén fijo ni indicado → error claro", async () => {
    await expect(orders.create(orgId, strangerId, {
      currency: "MXN", items: [{ variantId, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }],
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
