import { withSystem, withTenant, type ExtendedPrismaClient } from "./client.js";

// Estados de pedido que SÍ sostienen una reserva ACTIVE de inventario. En cualquier
// otro estado (o si el pedido ya no existe), una reserva ACTIVE de tipo "ORDER" es un
// hold FILTRADO — p.ej. un confirm() que falló y no pudo compensar la liberación.
const HOLDING_ORDER_STATUSES = new Set<string>(["CONFIRMED", "PARTIALLY_FULFILLED"]);

export interface OrphanHoldReleased {
  reservationId: string;
  organizationId: string;
  orderId: string | null;
  orderStatus: string; // estado del pedido, o "NOT_FOUND" si ya no existe
}

export interface ReconcileOptions {
  // Antigüedad mínima de la reserva para considerarla (evita tocar un confirm en
  // curso, que pasa un instante en ACTIVE antes de que el pedido quede CONFIRMED).
  graceMs?: number;
  now?: Date;
}

// Red de seguridad de inventario: libera holds huérfanos —reservas ACTIVE ligadas a
// un pedido que ya no las sostiene—. Sin esto, un fallo al compensar en confirm()
// deja stock reservado para siempre: aparece como no-disponible sin estarlo y el
// inventario disponible "encoge" en silencio. Idempotente (re-verifica ACTIVE dentro
// de la transacción con SELECT … FOR UPDATE). Devuelve los holds liberados (el caller
// decide cómo registrarlos). Reutilizable por el worker (cron) y por tests.
export async function reconcileOrphanOrderHolds(
  prisma: ExtendedPrismaClient,
  opts: ReconcileOptions = {}
): Promise<OrphanHoldReleased[]> {
  const now = opts.now ?? new Date();
  const graceMs = opts.graceMs ?? 15 * 60 * 1000;
  const cutoff = new Date(now.getTime() - graceMs);

  // Escaneo cross-tenant de reservas de pedido ACTIVE con antigüedad > gracia.
  const candidates = await withSystem(prisma, (tx) =>
    tx.inventoryReservation.findMany({
      where: { status: "ACTIVE", referenceType: "ORDER", createdAt: { lt: cutoff } },
      select: {
        id: true, organizationId: true, warehouseId: true, variantId: true,
        quantity: true, referenceId: true,
      },
    })
  );
  if (candidates.length === 0) return [];

  // Estado de los pedidos referenciados (una sola consulta).
  const orderIds = [
    ...new Set(candidates.map((c) => c.referenceId).filter((id): id is string => Boolean(id))),
  ];
  const orders = orderIds.length
    ? await withSystem(prisma, (tx) =>
        tx.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true } })
      )
    : [];
  const statusById = new Map(orders.map((o) => [o.id, o.status as string]));

  const released: OrphanHoldReleased[] = [];
  for (const c of candidates) {
    const status = c.referenceId ? statusById.get(c.referenceId) : undefined;
    // Hold legítimo: el pedido existe y está en un estado que lo sostiene → no tocar.
    if (status && HOLDING_ORDER_STATUSES.has(status)) continue;

    const didRelease = await withTenant(prisma, c.organizationId, async (tx) => {
      const fresh = await tx.inventoryReservation.findFirst({ where: { id: c.id, status: "ACTIVE" } });
      if (!fresh) return false; // ya cambió de estado → idempotente

      await tx.$queryRaw`
        SELECT 1 FROM "InventoryBalance"
        WHERE "organizationId" = ${c.organizationId}::uuid
          AND "warehouseId" = ${c.warehouseId}::uuid
          AND "variantId" = ${c.variantId}::uuid
        FOR UPDATE`;
      await tx.inventoryBalance.updateMany({
        where: { organizationId: c.organizationId, warehouseId: c.warehouseId, variantId: c.variantId },
        data: { reserved: { decrement: c.quantity }, version: { increment: 1 } },
      });
      await tx.inventoryReservation.update({ where: { id: c.id }, data: { status: "RELEASED" } });
      return true;
    });

    if (didRelease) {
      released.push({
        reservationId: c.id,
        organizationId: c.organizationId,
        orderId: c.referenceId,
        orderStatus: status ?? "NOT_FOUND",
      });
    }
  }
  return released;
}
