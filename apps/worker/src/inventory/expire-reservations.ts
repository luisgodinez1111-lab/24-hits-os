import { expireDueReservations, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Wrapper del worker: libera reservas vencidas (lógica en @24hits/database, testeable
// en el CI del API) y registra el resultado.
export async function expireReservations(
  prisma: ExtendedPrismaClient,
  logger: Logger,
  now: Date = new Date()
): Promise<number> {
  const released = await expireDueReservations(prisma, now);
  if (released > 0) logger.info("Reservas expiradas liberadas", { released });
  return released;
}
