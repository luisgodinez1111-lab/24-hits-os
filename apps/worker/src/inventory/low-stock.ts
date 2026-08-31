import { scanLowStockAllOrgs, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Wrapper del worker: genera notificaciones LOW_STOCK para las organizaciones activas
// (lógica compartida en @24hits/database, deduplicada 24h) y registra el resultado.
export async function scanLowStock(prisma: ExtendedPrismaClient, logger: Logger): Promise<number> {
  const created = await scanLowStockAllOrgs(prisma);
  if (created > 0) logger.info("Notificaciones de stock bajo generadas", { created });
  return created;
}
