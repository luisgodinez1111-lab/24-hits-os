import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  reconcileOrphanOrderHolds,
  withSystem,
  type ExtendedPrismaClient,
  type OrderStatus,
} from "@24hits/database";

// Requiere PostgreSQL migrado (con RLS) en DATABASE_URL.
const prisma: ExtendedPrismaClient = createPrismaClient();

const suffix = Date.now().toString(36);
let orgId: string;
let branchId: string;
let warehouseId: string;
let unitId: string;
let userId: string;

const OLD = 30; // minutos: supera el período de gracia (15 min)
const RECENT = 2; // minutos: dentro de la gracia

// Producto + variante + su balance con onHand fijo y `reserved` dado.
async function seedVariantWithBalance(reserved: number): Promise<string> {
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
      data: { organizationId: orgId, branchId, warehouseId, variantId: v.id, onHand: 100, reserved },
    });
    return v.id;
  });
}

async function createOrder(status: OrderStatus): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const o = await tx.order.create({
      data: {
        organizationId: orgId, branchId, warehouseId,
        number: `ORD-${randomUUID().slice(0, 8)}`,
        status,
        createdByUserId: userId,
      },
    });
    return o.id;
  });
}

// Reserva ACTIVE de tipo ORDER con antigüedad y pedido dados.
// orderStatus=null → el pedido no existe (caso NOT_FOUND).
async function seedHold(params: {
  orderStatus: OrderStatus | null;
  ageMinutes: number;
  quantity: number;
}): Promise<{ reservationId: string; variantId: string }> {
  const variantId = await seedVariantWithBalance(params.quantity);
  const orderId = params.orderStatus ? await createOrder(params.orderStatus) : randomUUID();
  const createdAt = new Date(Date.now() - params.ageMinutes * 60_000);
  const r = await withSystem(prisma, (tx) =>
    tx.inventoryReservation.create({
      data: {
        organizationId: orgId, branchId, warehouseId, variantId,
        quantity: params.quantity, status: "ACTIVE",
        referenceType: "ORDER", referenceId: orderId,
        createdByUserId: userId, createdAt,
      },
    })
  );
  return { reservationId: r.id, variantId };
}

function reservationStatus(id: string) {
  return withSystem(prisma, (tx) =>
    tx.inventoryReservation.findFirst({ where: { id }, select: { status: true } })
  );
}
function reservedOf(variantId: string) {
  return withSystem(prisma, (tx) =>
    tx.inventoryBalance.findFirst({ where: { variantId }, select: { reserved: true } })
  );
}

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Orphan Test", slug: `orphan-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    branchId = branch.id;
    const wh = await tx.warehouse.create({
      data: { organizationId: orgId, branchId, name: "W", code: `M-${suffix}`, type: "MAIN" },
    });
    warehouseId = wh.id;
    const unit = await tx.unitOfMeasure.create({ data: { organizationId: orgId, code: `PZ-${suffix}`, name: "Pieza" } });
    unitId = unit.id;
    const user = await tx.user.create({ data: { email: `orphan-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.inventoryReservation.deleteMany({ where: { organizationId: orgId } });
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

describe("Reconciliación de holds de inventario huérfanos", () => {
  it("libera un hold cuyo pedido fue CANCELADO y devuelve la reserva", async () => {
    const { reservationId, variantId } = await seedHold({ orderStatus: "CANCELLED", ageMinutes: OLD, quantity: 5 });
    const released = await reconcileOrphanOrderHolds(prisma);
    expect(released.some((r) => r.reservationId === reservationId)).toBe(true);
    expect((await reservationStatus(reservationId))?.status).toBe("RELEASED");
    expect((await reservedOf(variantId))?.reserved.toString()).toBe("0");
  });

  it("libera un hold cuyo pedido ya no existe (NOT_FOUND)", async () => {
    const { reservationId, variantId } = await seedHold({ orderStatus: null, ageMinutes: OLD, quantity: 3 });
    await reconcileOrphanOrderHolds(prisma);
    expect((await reservationStatus(reservationId))?.status).toBe("RELEASED");
    expect((await reservedOf(variantId))?.reserved.toString()).toBe("0");
  });

  it("NO toca un hold legítimo de un pedido CONFIRMED", async () => {
    const { reservationId, variantId } = await seedHold({ orderStatus: "CONFIRMED", ageMinutes: OLD, quantity: 7 });
    await reconcileOrphanOrderHolds(prisma);
    expect((await reservationStatus(reservationId))?.status).toBe("ACTIVE");
    expect((await reservedOf(variantId))?.reserved.toString()).toBe("7");
  });

  it("NO toca un hold huérfano reciente (dentro del período de gracia)", async () => {
    const { reservationId, variantId } = await seedHold({ orderStatus: "CANCELLED", ageMinutes: RECENT, quantity: 4 });
    await reconcileOrphanOrderHolds(prisma);
    expect((await reservationStatus(reservationId))?.status).toBe("ACTIVE");
    expect((await reservedOf(variantId))?.reserved.toString()).toBe("4");
  });

  it("es idempotente: correr dos veces no decrementa dos veces", async () => {
    const { reservationId, variantId } = await seedHold({ orderStatus: "CANCELLED", ageMinutes: OLD, quantity: 6 });
    await reconcileOrphanOrderHolds(prisma);
    const secondRun = await reconcileOrphanOrderHolds(prisma);
    expect(secondRun.some((r) => r.reservationId === reservationId)).toBe(false);
    expect((await reservationStatus(reservationId))?.status).toBe("RELEASED");
    expect((await reservedOf(variantId))?.reserved.toString()).toBe("0");
  });
});
