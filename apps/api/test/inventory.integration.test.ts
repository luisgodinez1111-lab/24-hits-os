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

// Requiere PostgreSQL migrado (catálogo+inventario+RLS) en DATABASE_URL.
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

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

async function createVariant(): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const p = await tx.product.create({
      data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" },
    });
    const v = await tx.productVariant.create({
      data: {
        organizationId: orgId,
        productId: p.id,
        sku: `SKU-${randomUUID()}`,
        name: "V",
        purchaseUnitId: unitId,
        salesUnitId: unitId,
      },
    });
    return v.id;
  });
}

function balanceOf(variantId: string) {
  return withTenant(prisma, orgId, (tx) => tx.inventoryBalance.findFirst({ where: { variantId } }));
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Inv Test", slug: `inv-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({
      data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" },
    });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `inv-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.inventoryReservation.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

describe("Inventario — ledger y disponibilidad", () => {
  it("saldo inicial crea onHand y disponible correctos", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 20 });
    const bal = await balanceOf(v);
    expect(bal?.onHand.toString()).toBe("20");
    expect(balances.available(bal!).toString()).toBe("20");
  });

  it("reservar reduce disponible; liberar lo restaura", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 10 });
    const r = await reservations.reserve(orgId, { warehouseId, variantId: v, quantity: 4, createdByUserId: userId });
    let bal = await balanceOf(v);
    expect(bal?.reserved.toString()).toBe("4");
    expect(balances.available(bal!).toString()).toBe("6");

    await reservations.release(orgId, r.id);
    bal = await balanceOf(v);
    expect(bal?.reserved.toString()).toBe("0");
    expect(balances.available(bal!).toString()).toBe("10");
  });
});

describe("Inventario — CONCURRENCIA (última unidad)", () => {
  it("dos reservas simultáneas de 1: solo una gana, la otra INVENTORY_INSUFFICIENT", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 1 });

    const attempt = () =>
      reservations.reserve(orgId, { warehouseId, variantId: v, quantity: 1, createdByUserId: userId });
    const results = await Promise.allSettled([attempt(), attempt()]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const reason = (failed[0] as PromiseRejectedResult).reason as { code?: string };
    expect(reason.code).toBe("INVENTORY_INSUFFICIENT");

    const bal = await balanceOf(v);
    expect(bal?.reserved.toString()).toBe("1"); // nunca 2
    expect(balances.available(bal!).toString()).toBe("0");
  });
});

describe("Inventario — IDEMPOTENCIA", () => {
  it("saldo inicial repetido con misma key no duplica inventario", async () => {
    const v = await createVariant();
    const key = `idem-${randomUUID()}`;
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 5, idempotencyKey: key });
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 5, idempotencyKey: key });

    const movements = await withTenant(prisma, orgId, (tx) =>
      tx.inventoryMovement.findMany({ where: { variantId: v } })
    );
    expect(movements).toHaveLength(1);
    const bal = await balanceOf(v);
    expect(bal?.onHand.toString()).toBe("5");
  });
});

describe("Inventario — INTEGRIDAD (rebuild vs ledger)", () => {
  it("rebuild reconstruye el balance desde el ledger tras una corrupción", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 10 });
    await inventory.markAsDamaged(orgId, userId, { warehouseId, variantId: v, quantity: 2, reasonText: "prueba" });

    // Corromper la proyección a propósito.
    await withSystem(prisma, (tx) =>
      tx.inventoryBalance.updateMany({ where: { variantId: v }, data: { onHand: 999 } })
    );
    await inventory.rebuildBalances(orgId);

    const bal = await balanceOf(v);
    expect(bal?.onHand.toString()).toBe("8");
    expect(bal?.damaged.toString()).toBe("2");

    const drift = await inventory.verifyDrift(orgId);
    expect(drift.ok).toBe(true);
  });
});
