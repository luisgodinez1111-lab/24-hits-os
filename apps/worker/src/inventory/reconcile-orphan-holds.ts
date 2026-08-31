import { reconcileOrphanOrderHolds as reconcile, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Wrapper del worker: corre la reconciliación de holds huérfanos (lógica en
// @24hits/database, testeada en el CI del API) y registra cada liberación. Red de
// seguridad para los holds de inventario que un confirm() fallido no pudo compensar.
export async function reconcileOrphanOrderHolds(
  prisma: ExtendedPrismaClient,
  logger: Logger
): Promise<number> {
  const released = await reconcile(prisma);
  for (const r of released) {
    logger.warn("Hold de inventario huérfano liberado (reconciliación)", {
      organizationId: r.organizationId,
      reservationId: r.reservationId,
      orderId: r.orderId,
      orderStatus: r.orderStatus,
    });
  }
  if (released.length > 0) {
    logger.info("Reconciliación de holds huérfanos completada", { released: released.length });
  }
  return released.length;
}
