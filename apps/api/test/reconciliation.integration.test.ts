import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  detectInventoryDrift,
  detectPaymentDrift,
  notifyInventoryDrift,
  withSystem,
  type ExtendedPrismaClient,
  type OrderStatus,
  type PaymentStatus,
} from "@24hits/database";

// Requiere PostgreSQL migrado (con RLS) en DATABASE_URL.
const prisma: ExtendedPrismaClient = createPrismaClient();

const suffix = Date.now().toString(36);
let orgId: string;
let branchId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

async function createOrder(total: number, paymentStatus: PaymentStatus, status: OrderStatus = "CONFIRMED"): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const o = await tx.order.create({
      data: {
        organizationId: orgId, branchId, warehouseId,
        number: `ORD-${randomUUID().slice(0, 8)}`,
        status, total, paymentStatus, createdByUserId: userId,
      },
    });
    return o.id;
  });
}

async function addPayment(orderId: string, amount: number): Promise<void> {
  await withSystem(prisma, (tx) =>
    tx.payment.create({
      data: {
        organizationId: orgId, branchId, orderId,
        method: "CASH", amount, status: "COMPLETED", createdByUserId: userId,
      },
    })
  );
}

// Balance con onHand dado pero SIN movimientos en el ledger → el cómputo desde el
// ledger da 0, forzando (o no) un drift según el valor.
async function createBalance(onHand: number): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const p = await tx.product.create({
      data: { organizationId: orgId, name: "P", slug: `p-${randomUUID()}`, status: "ACTIVE" },
    });
    const v = await tx.productVariant.create({
      data: {
        organizationId: orgId, productId: p.id, sku: `SKU-${randomUUID()}`, name: "V",
        purchaseUnitId: unitId, salesUnitId: unitId,
      },
    });
    await tx.inventoryBalance.create({
      data: { organizationId: orgId, branchId, warehouseId, variantId: v.id, onHand },
    });
    return v.id;
  });
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Recon Test", slug: `recon-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    branchId = branch.id;
    const wh = await tx.warehouse.create({
      data: { organizationId: orgId, branchId, name: "W", code: `M-${suffix}`, type: "MAIN" },
    });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `recon-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.notification.deleteMany({ where: { organizationId: orgId } });
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.inventoryBalance.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.unitOfMeasure.deleteMany({ where: { organizationId: orgId } });
    await tx.warehouse.deleteMany({ where: { organizationId: orgId } });
    await tx.branch.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

describe("Reconciliación de pagos", () => {
  it("detecta un pedido marcado PAID sin pagos reales (debería ser PENDING)", async () => {
    const orderId = await createOrder(100, "PAID"); // mentira: no tiene pagos
    const drifts = await detectPaymentDrift(prisma);
    const entry = drifts.find((d) => d.orderId === orderId);
    expect(entry).toBeDefined();
    expect(entry?.stored).toBe("PAID");
    expect(entry?.expected).toBe("PENDING");
  });

  it("detecta un pedido PENDING que en realidad ya está pagado", async () => {
    const orderId = await createOrder(100, "PENDING");
    await addPayment(orderId, 100);
    const drifts = await detectPaymentDrift(prisma);
    const entry = drifts.find((d) => d.orderId === orderId);
    expect(entry?.stored).toBe("PENDING");
    expect(entry?.expected).toBe("PAID");
  });

  it("NO reporta un pedido cuyo estado de pago SÍ cuadra", async () => {
    const orderId = await createOrder(100, "PAID");
    await addPayment(orderId, 100);
    const drifts = await detectPaymentDrift(prisma);
    expect(drifts.some((d) => d.orderId === orderId)).toBe(false);
  });
});

describe("Reconciliación de inventario", () => {
  it("detecta un balance cuyo onHand no coincide con el ledger", async () => {
    const variantId = await createBalance(50); // ledger vacío → esperado 0
    const drifts = await detectInventoryDrift(prisma);
    const entry = drifts.find((d) => d.variantId === variantId && d.field === "onHand");
    expect(entry).toBeDefined();
    expect(entry?.stored).toBe("50");
    expect(entry?.expected).toBe("0");
  });

  it("NO reporta un balance que cuadra con el ledger (onHand 0)", async () => {
    const variantId = await createBalance(0);
    const drifts = await detectInventoryDrift(prisma);
    expect(drifts.some((d) => d.variantId === variantId)).toBe(false);
  });

  it("notifyInventoryDrift crea una alerta y es idempotente (dedupe 24h)", async () => {
    const drifts = await detectInventoryDrift(prisma);
    const mine = drifts.filter((d) => d.organizationId === orgId);
    expect(mine.length).toBeGreaterThan(0);
    const first = await notifyInventoryDrift(prisma, mine);
    const second = await notifyInventoryDrift(prisma, mine);
    expect(first).toBe(1);
    expect(second).toBe(0); // deduplicado
    const notes = await withSystem(prisma, (tx) =>
      tx.notification.count({ where: { organizationId: orgId, type: "INVENTORY_DRIFT" } })
    );
    expect(notes).toBe(1);
  });
});
