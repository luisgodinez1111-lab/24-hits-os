import { withSystem, withTenant, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Libera reservas vencidas devolviendo disponibilidad. Idempotente: re-verifica el
// estado ACTIVE dentro de la transacción y nunca toca reservas CONSUMED (ADR-012).
export async function expireReservations(
  prisma: ExtendedPrismaClient,
  logger: Logger,
  now: Date = new Date()
): Promise<number> {
  // Escaneo cross-tenant con bypass de RLS (operación de sistema).
  const due = await withSystem(prisma, (tx) =>
    tx.inventoryReservation.findMany({
      where: { status: "ACTIVE", expiresAt: { not: null, lt: now } },
      select: { id: true, organizationId: true, warehouseId: true, variantId: true, quantity: true },
    })
  );

  let released = 0;
  for (const r of due) {
    await withTenant(prisma, r.organizationId, async (tx) => {
      const fresh = await tx.inventoryReservation.findFirst({ where: { id: r.id, status: "ACTIVE" } });
      if (!fresh) return; // cambió de estado → idempotente

      await tx.$queryRaw`
        SELECT 1 FROM "InventoryBalance"
        WHERE "organizationId" = ${r.organizationId}::uuid
          AND "warehouseId" = ${r.warehouseId}::uuid
          AND "variantId" = ${r.variantId}::uuid
        FOR UPDATE`;
      await tx.inventoryBalance.updateMany({
        where: { organizationId: r.organizationId, warehouseId: r.warehouseId, variantId: r.variantId },
        data: { reserved: { decrement: r.quantity }, version: { increment: 1 } },
      });
      await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
      released += 1;
    });
  }

  if (released > 0) logger.info("Reservas expiradas liberadas", { released });
  return released;
}
