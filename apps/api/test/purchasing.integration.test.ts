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
import { PurchaseOrderService } from "../src/purchasing/purchase-order.service.js";
import { PurchaseReceiptService } from "../src/purchasing/purchase-receipt.service.js";

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
const orders = new PurchaseOrderService(prismaService, audit);
const receipts = new PurchaseReceiptService(prismaService, ledger, cost, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let supplierId: string;

async function createVariant(): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const p = await tx.product.create({ data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({
      data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V", purchaseUnitId: unitId, salesUnitId: unitId },
    });
    return v.id;
  });
}
const balanceOf = (variantId: string) => withTenant(prisma, orgId, (tx) => tx.inventoryBalance.findFirst({ where: { warehouseId, variantId } }));
const costOf = (variantId: string) => withTenant(prisma, orgId, (tx) => tx.variantCost.findUnique({ where: { variantId } }));

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Pur", slug: `pur-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `pur-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const supplier = await tx.supplier.create({ data: { organizationId: orgId, name: "Proveedor Demo" } });
    supplierId = supplier.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.purchaseReceiptItem.deleteMany({ where: { organizationId: orgId } });
    await tx.purchaseReceipt.deleteMany({ where: { organizationId: orgId } });
    await tx.purchaseOrderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.purchaseOrder.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

describe("Compras — recepción alimenta inventario y costo promedio (ADR-019)", () => {
  it("post de recepción contra PO: onHand sube, PO conciliada, costo inicial", async () => {
    const v = await createVariant();
    const po = await orders.create(orgId, userId, {
      supplierId, warehouseId, currency: "MXN",
      items: [{ variantId: v, orderedQuantity: 5, unitCost: 100, taxRate: 0 }],
    });
    await orders.submit(orgId, po.id);
    await orders.approve(orgId, userId, po.id);
    await orders.order(orgId, po.id);

    const receipt = await receipts.create(orgId, userId, {
      supplierId, warehouseId, purchaseOrderId: po.id,
      items: [{ variantId: v, quantity: 5, unitCost: 100, purchaseOrderItemId: po.items[0]!.id }],
    });
    await receipts.post(orgId, userId, receipt.id);

    expect((await balanceOf(v))?.onHand.toString()).toBe("5");
    expect((await costOf(v))?.averageCost.toString()).toBe("100");

    const freshPo = await withTenant(prisma, orgId, (tx) => tx.purchaseOrder.findFirst({ where: { id: po.id }, include: { items: true } }));
    expect(freshPo?.status).toBe("RECEIVED");
    expect(freshPo?.items[0]!.receivedQuantity.toString()).toBe("5");
  });

  it("costo promedio móvil: 10@100 + 10@200 => promedio 150", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 10, unitCost: 100 });

    const receipt = await receipts.create(orgId, userId, {
      supplierId, warehouseId,
      items: [{ variantId: v, quantity: 10, unitCost: 200 }],
    });
    await receipts.post(orgId, userId, receipt.id);

    const c = await costOf(v);
    expect(c?.averageCost.toString()).toBe("150");
    expect(c?.quantityOnHand.toString()).toBe("20");
    expect((await balanceOf(v))?.onHand.toString()).toBe("20");
  });

  it("idempotencia: re-postear una recepción falla y no duplica inventario", async () => {
    const v = await createVariant();
    const receipt = await receipts.create(orgId, userId, {
      supplierId, warehouseId,
      items: [{ variantId: v, quantity: 7, unitCost: 50 }],
    });
    await receipts.post(orgId, userId, receipt.id);
    await expect(receipts.post(orgId, userId, receipt.id)).rejects.toMatchObject({ code: "PURCHASE_ALREADY_POSTED" });

    expect((await balanceOf(v))?.onHand.toString()).toBe("7");
  });
});
