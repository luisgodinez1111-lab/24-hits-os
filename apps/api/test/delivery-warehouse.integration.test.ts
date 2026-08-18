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
    // Coordenadas extraídas del link (Google Maps).
    expect(Number(order.deliveryLat)).toBeCloseTo(28.6, 2);
    expect(Number(order.deliveryLng)).toBeCloseTo(-106.0, 2);
  });

  it("entregas pendientes expone coordenadas (tolera Apple Maps)", async () => {
    const order = await orders.create(orgId, userId, {
      currency: "MXN",
      deliveryAddress: "Dom con pin de Apple",
      deliveryLocationUrl: "https://maps.apple.com/?ll=28.635,-106.075",
      items: [{ variantId, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }],
    }) as { id: string; deliveryLat: number | null };
    expect(Number(order.deliveryLat)).toBeCloseTo(28.635, 2);
    const pend = (await orders.pendingDeliveries(orgId)) as Array<{ id: string; deliveryLat: number | null; deliveryStatus: string }>;
    const row = pend.find((p) => p.id === order.id);
    expect(row).toBeTruthy();
    expect(Number(row!.deliveryLat)).toBeCloseTo(28.635, 2);
    expect(row!.deliveryStatus).toBe("PENDING");
  });

  it("optimizeRoute arma la ruta global (2-opt, haversine) con tramos y total", async () => {
    const res = (await orders.optimizeRoute(orgId, { lat: 28.6, lng: -106.0 })) as {
      provider: string;
      totalKm: number;
      totalMin: number | null;
      stops: Array<{ deliveryLat: number | null; legKm: number | null }>;
    };
    expect(res.provider).toBe("haversine");
    expect(res.totalMin).toBeNull(); // sin OSRM no hay minutos
    expect(res.stops.length).toBeGreaterThan(0);
    let sum = 0;
    for (const s of res.stops) {
      expect(s.deliveryLat).not.toBeNull();
      expect(typeof s.legKm).toBe("number");
      sum += s.legKm ?? 0;
    }
    expect(res.totalKm).toBeCloseTo(Math.round(sum * 10) / 10, 1);
  });

  it("marcar Entregado auto-entrega el pedido (fulfill) y descuenta inventario", async () => {
    const before = await withTenant(prisma, orgId, (tx) =>
      tx.inventoryBalance.findFirst({ where: { warehouseId, variantId }, select: { onHand: true } })
    );
    const order = await orders.create(orgId, userId, {
      currency: "MXN", deliveryAddress: "Dom", items: [{ variantId, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }],
    });
    const updated = await orders.updateDelivery(orgId, order.id, userId, { status: "DELIVERED", deliveryNotes: "Entregado a portería" }) as {
      deliveryStatus: string; deliveryNotes: string | null; status: string; items: Array<{ fulfilledQuantity: unknown }>;
    };
    expect(updated.deliveryStatus).toBe("DELIVERED");
    expect(updated.deliveryNotes).toBe("Entregado a portería");
    // Auto-fulfill: estado FULFILLED y el físico bajó 1 unidad.
    expect(updated.status).toBe("FULFILLED");
    expect(Number(updated.items[0]!.fulfilledQuantity)).toBe(1);
    const after = await withTenant(prisma, orgId, (tx) =>
      tx.inventoryBalance.findFirst({ where: { warehouseId, variantId }, select: { onHand: true } })
    );
    expect(Number(after!.onHand)).toBe(Number(before!.onHand) - 1);
  });

  it("sin almacén fijo ni indicado → error claro", async () => {
    await expect(orders.create(orgId, strangerId, {
      currency: "MXN", items: [{ variantId, quantity: 1, unitPrice: 100, discount: 0, taxRate: 0 }],
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
