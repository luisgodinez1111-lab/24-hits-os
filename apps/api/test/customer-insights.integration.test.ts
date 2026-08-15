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
import { CustomerService } from "../src/sales/customer.service.js";

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
const customers = new CustomerService(prismaService, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let flavorSandia: string;

// Crea una variante con sabor/marca/modelo y stock, y devuelve su id.
async function variantWith(flavorId: string, brand: string, model: string): Promise<string> {
  const id = await withSystem(prisma, async (tx) => {
    const b = await tx.brand.create({ data: { organizationId: orgId, name: brand, slug: `${brand}-${randomUUID()}` } });
    const p = await tx.product.create({ data: { organizationId: orgId, name: model, slug: `p-${randomUUID()}`, status: "ACTIVE", brandId: b.id } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, flavorId, sku: `SKU-${randomUUID()}`, name: model, purchaseUnitId: unitId, salesUnitId: unitId } });
    return v.id;
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId: id, quantity: 100, unitCost: 50 });
  return id;
}

async function fulfilledOrder(customerId: string, variantId: string, qty: number, price: number) {
  const order = await orders.create(orgId, userId, { warehouseId, customerId, currency: "MXN", items: [{ variantId, quantity: qty, unitPrice: price, discount: 0, taxRate: 0 }] });
  await orders.confirm(orgId, userId, order.id);
  await orders.fulfill(orgId, userId, order.id);
  return order.id;
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "CRM", slug: `crm-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId: branch.id, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `crm-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const f = await tx.flavor.create({ data: { organizationId: orgId, name: "Sandía", normalizedName: "sandia" } });
    flavorSandia = f.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.customer.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryReservation.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.costHistory.deleteMany({ where: { organizationId: orgId } });
    await tx.variantCost.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.brand.deleteMany({ where: { organizationId: orgId } });
    await tx.flavor.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

describe("CRM de clientes: número autogenerado + analítica", () => {
  it("autogenera el número de cliente secuencial y respeta el manual", async () => {
    const c1 = await customers.create(orgId, { name: "Ana", type: "RETAIL" });
    const c2 = await customers.create(orgId, { name: "Beto", type: "RETAIL", zone: "NORTE" });
    expect(c1.code).toBe("C-0001");
    expect(c2.code).toBe("C-0002");
    expect(c2.zone).toBe("NORTE");

    const c3 = await customers.create(orgId, { name: "Cea", type: "RETAIL", code: "VIP-1" });
    expect(c3.code).toBe("VIP-1");

    // El siguiente autogenerado sigue la secuencia numérica (ignora VIP-1).
    const c4 = await customers.create(orgId, { name: "Dio", type: "RETAIL" });
    expect(c4.code).toBe("C-0003");
  });

  it("asigna números únicos bajo creación concurrente (sin carrera)", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => customers.create(orgId, { name: `Conc ${i}`, type: "RETAIL" }))
    );
    const codes = results.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length); // todos distintos
    expect(codes.every((c) => /^C-\d{4,}$/.test(c ?? ""))).toBe(true);
  });

  it("clasifica la zona desde la dirección cuando no se indica (autoridad backend)", async () => {
    const c = await customers.create(orgId, { name: "Dir", type: "RETAIL", address: "Calle 20 #100, Col. Santo Niño" });
    expect(c.zone).toBe("CENTRO");
    const n = await customers.create(orgId, { name: "Dir2", type: "RETAIL", address: "Parcela 5, zona norte" });
    expect(n.zone).toBe("NORTE");
    // La zona explícita gana sobre la derivada de la dirección.
    const o = await customers.create(orgId, { name: "Dir3", type: "RETAIL", address: "Col. Santo Niño", zone: "SUR" });
    expect(o.zone).toBe("SUR");
  });

  it("rechaza un número de cliente duplicado", async () => {
    await customers.create(orgId, { name: "Uno", type: "RETAIL", code: "DUP-1" });
    await expect(customers.create(orgId, { name: "Dos", type: "RETAIL", code: "DUP-1" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("calcula pedidos, gasto, ticket y sabores/modelos/marcas favoritos", async () => {
    const cust = await customers.create(orgId, { name: "Frecuente", type: "RETAIL", zone: "CENTRO", phone: "6141112233" });
    const v = await variantWith(flavorSandia, "Hyper Bar", "Hyper 9000");
    await fulfilledOrder(cust.id, v, 3, 100); // 300
    await fulfilledOrder(cust.id, v, 2, 100); // 200

    const ins = await customers.insights(orgId, cust.id);
    expect(ins.summary.orderCount).toBe(2);
    expect(ins.summary.totalSpent).toBe("500");
    expect(ins.summary.avgTicket).toBe("250");
    expect(ins.customer.zone).toBe("CENTRO");
    expect(ins.topFlavors[0]).toMatchObject({ label: "Sandía", units: "5" });
    expect(ins.topModels[0]).toMatchObject({ label: "Hyper 9000", units: "5" });
    expect(ins.topBrands[0]).toMatchObject({ label: "Hyper Bar", units: "5" });
  });
});
