import { scanStaleCashSessionsAllOrgs, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Wrapper del worker: genera recordatorios de corte de caja para turnos abiertos
// demasiado tiempo (lógica compartida en @24hits/database, deduplicada 24h).
export async function scanStaleCashSessions(prisma: ExtendedPrismaClient, logger: Logger): Promise<number> {
  const created = await scanStaleCashSessionsAllOrgs(prisma);
  if (created > 0) logger.info("Recordatorios de corte de caja generados", { created });
  return created;
}
