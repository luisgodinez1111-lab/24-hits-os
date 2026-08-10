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
import { CustomerService } from "../src/sales/customer.service.js";
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
const customers = new CustomerService(prismaService, audit);
const orders = new OrderService(prismaService, ledger, cost, balances, reservations, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

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
    const org = await tx.organization.create({ data: { name: "Sales", slug: `sales-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `sales-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.customer.deleteMany({ where: { organizationId: orgId } });
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

describe("Ventas — confirmar reserva, entregar consume + COGS (ADR-020/021)", () => {
  it("flujo completo: DRAFT → CONFIRMED reserva, FULFILLED consume con COGS", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 10, unitCost: 100 });

    const order = await orders.create(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [{ variantId: v, quantity: 3, unitPrice: 150, discount: 0, taxRate: 0 }],
    });
    expect(order.status).toBe("DRAFT");
    expect(order.total.toString()).toBe("450");

    // CONFIRM: reserva 3 → available baja, onHand intacto.
    await orders.confirm(orgId, userId, order.id);
    let bal = await balanceOf(v);
    expect(bal?.onHand.toString()).toBe("10");
    expect(bal?.reserved.toString()).toBe("3");

    // FULFILL: consume → onHand 7, reserva CONSUMED, COGS 100 snapshot.
    const fulfilled = await orders.fulfill(orgId, userId, order.id);
    expect(fulfilled.status).toBe("FULFILLED");
    bal = await balanceOf(v);
    expect(bal?.onHand.toString()).toBe("7");
    expect(bal?.reserved.toString()).toBe("0");

    const item = fulfilled.items[0]!;
    expect(item.fulfilledQuantity.toString()).toBe("3");
    expect(item.unitCostSnapshot?.toString()).toBe("100");

    const c = await costOf(v);
    expect(c?.quantityOnHand.toString()).toBe("7");
    expect(c?.averageCost.toString()).toBe("100"); // el promedio no cambia al salir

    const sale = await withTenant(prisma, orgId, (tx) =>
      tx.inventoryMovement.findFirst({ where: { variantId: v, movementType: "SALE" } })
    );
    expect(sale?.unitCost?.toString()).toBe("100");
  });

  it("confirmar con stock insuficiente en un renglón: compensa y no deja reservas huérfanas", async () => {
    const a = await createVariant();
    const b = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: a, quantity: 5, unitCost: 10 });
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: b, quantity: 1, unitCost: 10 });

    const order = await orders.create(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [
        { variantId: a, quantity: 5, unitPrice: 20, discount: 0, taxRate: 0 },
        { variantId: b, quantity: 999, unitPrice: 20, discount: 0, taxRate: 0 },
      ],
    });

    await expect(orders.confirm(orgId, userId, order.id)).rejects.toMatchObject({ code: "INVENTORY_INSUFFICIENT" });

    // La reserva del renglón A debió liberarse (compensación).
    expect((await balanceOf(a))?.reserved.toString()).toBe("0");
    expect((await balanceOf(b))?.reserved.toString()).toBe("0");
    const fresh = await withTenant(prisma, orgId, (tx) => tx.order.findFirst({ where: { id: order.id } }));
    expect(fresh?.status).toBe("DRAFT");
  });

  it("cancelar un pedido confirmado libera las reservas (restaura disponibilidad)", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 8, unitCost: 10 });

    const order = await orders.create(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [{ variantId: v, quantity: 4, unitPrice: 20, discount: 0, taxRate: 0 }],
    });
    await orders.confirm(orgId, userId, order.id);
    expect((await balanceOf(v))?.reserved.toString()).toBe("4");

    const cancelled = await orders.cancel(orgId, order.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect((await balanceOf(v))?.reserved.toString()).toBe("0");
    expect((await balanceOf(v))?.onHand.toString()).toBe("8");
  });

  it("no se cancela un pedido ya entregado", async () => {
    const v = await createVariant();
    await inventory.openingBalance(orgId, userId, { warehouseId, variantId: v, quantity: 6, unitCost: 10 });
    const order = await orders.create(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [{ variantId: v, quantity: 2, unitPrice: 20, discount: 0, taxRate: 0 }],
    });
    await orders.confirm(orgId, userId, order.id);
    await orders.fulfill(orgId, userId, order.id);
    await expect(orders.cancel(orgId, order.id)).rejects.toMatchObject({ code: "ORDER_INVALID_STATE" });
  });

  it("clientes: crear y actualizar", async () => {
    const c = await customers.create(orgId, { name: "Mayorista MX", type: "WHOLESALE", creditLimit: 5000 });
    expect(c.type).toBe("WHOLESALE");
    const upd = await customers.update(orgId, c.id, { status: "INACTIVE" });
    expect(upd.status).toBe("INACTIVE");
  });
});
