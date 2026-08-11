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
import { InventoryService } from "../src/inventory/inventory.service.js";
import { NotificationService } from "../src/notifications/notification.service.js";

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
const inventory = new InventoryService(prismaService, ledger, cost, balances, audit);
const notifications = new NotificationService(prismaService);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let otherUserId: string;

async function createVariant(): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Notif", slug: `notif-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `n1-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const other = await tx.user.create({ data: { email: `n2-${suffix}@example.local`, passwordHash: "x" } });
    otherUserId = other.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.notification.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryPolicy.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
    await tx.user.delete({ where: { id: otherUserId } });
  });
  await prisma.$disconnect();
});

describe("Notificaciones — stock bajo, deduplicación y lectura (ADR-026)", () => {
  it("genera LOW_STOCK bajo el mínimo y deduplica en 24h", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 3, unitCost: 10 });
    await withSystem(prisma, (tx) => tx.inventoryPolicy.create({ data: { organizationId: orgId, warehouseId, variantId: v, minimumStock: 5, enabled: true } }));

    const first = await notifications.scanLowStock(orgId);
    expect(first.created).toBe(1);
    // Segundo escaneo: deduplicado (misma alerta vigente).
    const second = await notifications.scanLowStock(orgId);
    expect(second.created).toBe(0);

    const list = await notifications.list(orgId, userId);
    const low = list.find((n) => n.type === "LOW_STOCK");
    expect(low).toBeTruthy();
    expect(low!.severity).toBe("WARNING");
  });

  it("marca CRITICAL cuando no hay disponibilidad", async () => {
    const v = await createVariant();
    await withSystem(prisma, (tx) => tx.inventoryPolicy.create({ data: { organizationId: orgId, warehouseId, variantId: v, minimumStock: 5, enabled: true } }));
    await notifications.scanLowStock(orgId);
    const list = await notifications.list(orgId, userId);
    const crit = list.find((n) => n.entityId === v);
    expect(crit?.severity).toBe("CRITICAL");
  });

  it("difusión visible + personales aisladas por usuario", async () => {
    await withSystem(prisma, async (tx) => {
      await tx.notification.create({ data: { organizationId: orgId, recipientUserId: userId, type: "SYSTEM", title: "Para mí", body: "b" } });
      await tx.notification.create({ data: { organizationId: orgId, recipientUserId: otherUserId, type: "SYSTEM", title: "Para otro", body: "b" } });
    });
    const mine = await notifications.list(orgId, userId);
    expect(mine.some((n) => n.title === "Para mí")).toBe(true);
    expect(mine.some((n) => n.title === "Para otro")).toBe(false);
    // Las de difusión (LOW_STOCK, recipient null) sí aparecen.
    expect(mine.some((n) => n.type === "LOW_STOCK")).toBe(true);
  });

  it("unreadCount, markRead y markAllRead", async () => {
    const before = await notifications.unreadCount(orgId, userId);
    expect(before.count).toBeGreaterThan(0);

    const list = await notifications.list(orgId, userId);
    const target = list.find((n) => n.readAt === null)!;
    const read = await notifications.markRead(orgId, userId, target.id);
    expect(read.readAt).not.toBeNull();

    const all = await notifications.markAllRead(orgId, userId);
    expect(all.updated).toBeGreaterThanOrEqual(0);
    const after = await notifications.unreadCount(orgId, userId);
    expect(after.count).toBe(0);
  });

  it("marcar una notificación de otro usuario no es visible (404)", async () => {
    const foreign = await withSystem(prisma, (tx) =>
      tx.notification.create({ data: { organizationId: orgId, recipientUserId: otherUserId, type: "SYSTEM", title: "ajena", body: "b" } })
    );
    await expect(notifications.markRead(orgId, userId, foreign.id)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
  });
});
