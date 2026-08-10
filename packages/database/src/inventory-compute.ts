import { Prisma } from "@prisma/client";
import type { TenantTx } from "./client.js";
import { MOVEMENT_EFFECTS } from "./inventory-effects.js";

export interface BalanceBuckets {
  onHand: Prisma.Decimal;
  reserved: Prisma.Decimal;
  allocated: Prisma.Decimal;
  damaged: Prisma.Decimal;
  quarantine: Prisma.Decimal;
  inTransitIncoming: Prisma.Decimal;
  inTransitOutgoing: Prisma.Decimal;
}

export interface BalanceKeyLite {
  organizationId: string;
  warehouseId: string;
  variantId: string;
}

const ZERO = new Prisma.Decimal(0);
const OPEN_TRANSFER_STATUSES = ["IN_TRANSIT", "PARTIALLY_RECEIVED"] as const;

// Reconstruye los buckets de balance desde el ledger físico (movimientos) + los
// subledgers (reservas, asignaciones, items de transferencia abiertos). Fuente única
// usada por el motor del API y por el job de drift del worker (ADR-011/012/017).
export async function computeBalanceBuckets(
  client: TenantTx,
  key: BalanceKeyLite
): Promise<BalanceBuckets> {
  const movements = await client.inventoryMovement.findMany({
    where: { organizationId: key.organizationId, warehouseId: key.warehouseId, variantId: key.variantId },
    select: { movementType: true, quantity: true },
  });

  const buckets: BalanceBuckets = {
    onHand: ZERO,
    reserved: ZERO,
    allocated: ZERO,
    damaged: ZERO,
    quarantine: ZERO,
    inTransitIncoming: ZERO,
    inTransitOutgoing: ZERO,
  };

  for (const m of movements) {
    const e = MOVEMENT_EFFECTS[m.movementType];
    const q = new Prisma.Decimal(m.quantity);
    buckets.onHand = buckets.onHand.plus(q.times(e.onHand));
    buckets.damaged = buckets.damaged.plus(q.times(e.damaged));
    buckets.quarantine = buckets.quarantine.plus(q.times(e.quarantine));
  }

  const [reservedAgg, allocatedAgg, outgoing, incoming] = await Promise.all([
    client.inventoryReservation.aggregate({ where: { ...key, status: "ACTIVE" }, _sum: { quantity: true } }),
    client.inventoryAllocation.aggregate({ where: { ...key, status: "ACTIVE" }, _sum: { quantity: true } }),
    client.warehouseTransferItem.findMany({
      where: {
        organizationId: key.organizationId,
        variantId: key.variantId,
        transfer: { sourceWarehouseId: key.warehouseId, status: { in: [...OPEN_TRANSFER_STATUSES] } },
      },
      select: { shippedQuantity: true, receivedQuantity: true },
    }),
    client.warehouseTransferItem.findMany({
      where: {
        organizationId: key.organizationId,
        variantId: key.variantId,
        transfer: { destinationWarehouseId: key.warehouseId, status: { in: [...OPEN_TRANSFER_STATUSES] } },
      },
      select: { shippedQuantity: true, receivedQuantity: true },
    }),
  ]);

  buckets.reserved = new Prisma.Decimal(reservedAgg._sum.quantity ?? 0);
  buckets.allocated = new Prisma.Decimal(allocatedAgg._sum.quantity ?? 0);
  for (const it of outgoing) {
    buckets.inTransitOutgoing = buckets.inTransitOutgoing.plus(new Prisma.Decimal(it.shippedQuantity).minus(it.receivedQuantity));
  }
  for (const it of incoming) {
    buckets.inTransitIncoming = buckets.inTransitIncoming.plus(new Prisma.Decimal(it.shippedQuantity).minus(it.receivedQuantity));
  }
  return buckets;
}
