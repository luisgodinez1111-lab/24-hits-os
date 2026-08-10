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
import { TransferService } from "../src/transfers/transfer.service.js";
import { StockCountService } from "../src/stock-counts/stock-count.service.js";

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
const transfers = new TransferService(prismaService, ledger, balances, audit);
const counts = new StockCountService(prismaService, ledger, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let whA: string;
let whB: string;
let unitId: string;
let userId: string;
let approverId: string;

async function createVariant(): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({
      data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId },
    });
    return v.id;
  });
}
function balanceOf(warehouseId: string, variantId: string) {
  return withTenant(prisma, orgId, (tx) => tx.inventoryBalance.findFirst({ where: { warehouseId, variantId } }));
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "TC", slug: `tc-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const a = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "A", code: `A-${suffix}`, type: "MAIN" } });
    const b = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "B", code: `B-${suffix}`, type: "MAIN" } });
    whA = a.id;
    whB = b.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const u1 = await tx.user.create({ data: { email: `tc-${suffix}@example.local`, passwordHash: "x" } });
    const u2 = await tx.user.create({ data: { email: `tc2-${suffix}@example.local`, passwordHash: "x" } });
    userId = u1.id;
    approverId = u2.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.warehouseTransferItem.deleteMany({ where: { organizationId: orgId } });
    await tx.warehouseTransfer.deleteMany({ where: { organizationId: orgId } });
    await tx.stockCountItem.deleteMany({ where: { organizationId: orgId } });
    await tx.stockCount.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
    await tx.user.delete({ where: { id: approverId } });
  });
  await prisma.$disconnect();
});

describe("Transferencias — flujo completo con tránsito", () => {
  it("enviar mueve a tránsito; recibir completa en destino", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId: whA, variantId: v, quantity: 10 });

    const t = await transfers.create(orgId, userId, {
      sourceWarehouseId: whA,
      destinationWarehouseId: whB,
      items: [{ variantId: v, requestedQuantity: 4 }],
    });
    await transfers.request(orgId, t.id);
    await transfers.approve(orgId, approverId, t.id);
    await transfers.ship(orgId, userId, t.id, {});

    let a = await balanceOf(whA, v);
    let b = await balanceOf(whB, v);
    expect(a?.onHand.toString()).toBe("6");
    expect(a?.inTransitOutgoing.toString()).toBe("4");
    expect(b?.inTransitIncoming.toString()).toBe("4");
    expect(b?.onHand.toString()).toBe("0");

    const item = t.items[0]!;
    await transfers.receive(orgId, approverId, t.id, { items: [{ itemId: item.id, quantity: 4 }] });

    a = await balanceOf(whA, v);
    b = await balanceOf(whB, v);
    expect(a?.inTransitOutgoing.toString()).toBe("0");
    expect(b?.onHand.toString()).toBe("4");
    expect(b?.inTransitIncoming.toString()).toBe("0");

    const fresh = await withTenant(prisma, orgId, (tx) => tx.warehouseTransfer.findFirst({ where: { id: t.id } }));
    expect(fresh?.status).toBe("RECEIVED");
  });

  it("recepción parcial deja incidencia abierta (PARTIALLY_RECEIVED)", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId: whA, variantId: v, quantity: 10 });
    const t = await transfers.create(orgId, userId, {
      sourceWarehouseId: whA,
      destinationWarehouseId: whB,
      items: [{ variantId: v, requestedQuantity: 10 }],
    });
    await transfers.request(orgId, t.id);
    await transfers.approve(orgId, approverId, t.id);
    await transfers.ship(orgId, userId, t.id, {});
    await transfers.receive(orgId, approverId, t.id, { items: [{ itemId: t.items[0]!.id, quantity: 8 }] });

    const fresh = await withTenant(prisma, orgId, (tx) => tx.warehouseTransfer.findFirst({ where: { id: t.id }, include: { items: true } }));
    expect(fresh?.status).toBe("PARTIALLY_RECEIVED");
    const b = await balanceOf(whB, v);
    expect(b?.onHand.toString()).toBe("8");
    expect(b?.inTransitIncoming.toString()).toBe("2"); // faltante en tránsito
  });
});

describe("Conteos físicos — diferencia y aplicación al ledger", () => {
  it("expected 10, counted 8 -> difference -2 -> apply deja balance 8", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId: whA, variantId: v, quantity: 10 });

    const c = await counts.create(orgId, userId, { warehouseId: whA, type: "CUSTOM", blindCount: false, variantIds: [v] });
    await counts.start(orgId, userId, c.id);
    const started = await withTenant(prisma, orgId, (tx) => tx.stockCount.findFirst({ where: { id: c.id }, include: { items: true } }));
    const item = started!.items[0]!;
    expect(item.expectedQuantity.toString()).toBe("10");

    await counts.capture(orgId, c.id, { items: [{ itemId: item.id, countedQuantity: 8 }] });
    await counts.submit(orgId, c.id);
    await counts.approve(orgId, approverId, c.id);
    await counts.apply(orgId, approverId, c.id);

    const bal = await balanceOf(whA, v);
    expect(bal?.onHand.toString()).toBe("8");

    // Re-aplicar debe fallar (inmutable tras APPLIED).
    await expect(counts.apply(orgId, approverId, c.id)).rejects.toMatchObject({ code: "STOCK_COUNT_ALREADY_APPLIED" });
  });
});
