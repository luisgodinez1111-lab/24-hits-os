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
let branchId: string;
let warehouseId: string;
let unitId: string;
let userId: string;
let variantId: string;
const BARCODE = `750100${suffix}`;

const balanceOf = (v: string) => withTenant(prisma, orgId, (tx) => tx.inventoryBalance.findFirst({ where: { warehouseId, variantId: v } }));

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Pos", slug: `pos-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    branchId = branch.id;
    const wh = await tx.warehouse.create({ data: { organizationId: orgId, branchId, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `pos-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
    const p = await tx.product.create({ data: { organizationId: orgId, name: "Vape X", slug: `p-${randomUUID()}`, status: "ACTIVE" } });
    const v = await tx.productVariant.create({ data: { organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "Blue Razz", purchaseUnitId: unitId, salesUnitId: unitId } });
    variantId = v.id;
    await tx.productBarcode.create({ data: { organizationId: orgId, variantId, barcode: BARCODE, type: "EAN", isPrimary: true } });
    // Lista de precios RETAIL con precio 150.
    const list = await tx.priceList.create({ data: { organizationId: orgId, name: "Mostrador", type: "RETAIL", currency: "MXN", status: "ACTIVE" } });
    await tx.priceListItem.create({ data: { organizationId: orgId, priceListId: list.id, variantId, price: 150, validFrom: new Date(Date.now() - 1000) } });
  });
  await inventory.openingBalance(orgId, userId, { warehouseId, variantId, quantity: 20, unitCost: 90 });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.saleNoteItem.deleteMany({ where: { organizationId: orgId } });
    await tx.saleNote.deleteMany({ where: { organizationId: orgId } });
    await tx.documentSequence.deleteMany({ where: { organizationId: orgId } });
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.orderItem.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.priceListItem.deleteMany({ where: { organizationId: orgId } });
    await tx.priceList.deleteMany({ where: { organizationId: orgId } });
    await tx.productBarcode.deleteMany({ where: { organizationId: orgId } });
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

describe("POS — escaneo de código de barras + venta orquestada", () => {
  it("lookup resuelve el código a variante con precio y disponible", async () => {
    const r = await pos.lookup(orgId, { barcode: BARCODE, warehouseId });
    expect(r.variantId).toBe(variantId);
    expect(r.name).toContain("Vape X");
    expect(r.price).toBe("150");
    expect(r.available).toBe("20");
  });

  it("código desconocido → VARIANT_NOT_FOUND", async () => {
    await expect(pos.lookup(orgId, { barcode: "000000000000" })).rejects.toMatchObject({ code: "VARIANT_NOT_FOUND" });
  });

  it("venta orquestada: baja stock, cobra, emite nota y cierra el pedido", async () => {
    const res = await pos.sale(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [{ variantId, quantity: 2, unitPrice: 150, discount: 0 }],
      payment: { method: "CARD" },
      issueSaleNote: true,
    });

    expect(res.order.status).toBe("COMPLETED");
    expect(res.order.paymentStatus).toBe("PAID");
    expect(res.order.total.toString()).toBe("300");
    expect(res.saleNote?.number).toBeTruthy();
    expect(res.saleNote?.total.toString()).toBe("300");

    // Inventario bajó de 20 a 18.
    expect((await balanceOf(variantId))?.onHand.toString()).toBe("18");
  });

  it("venta POS en efectivo SIN turno de caja se registra igual (turno opcional)", async () => {
    const res = await pos.sale(orgId, userId, {
      warehouseId, currency: "MXN",
      items: [{ variantId, quantity: 1, unitPrice: 150, discount: 0 }],
      payment: { method: "CASH" },
      issueSaleNote: false,
    });
    expect(res.order.status).toBe("COMPLETED");
    expect(res.order.paymentStatus).toBe("PAID");
  });
});
