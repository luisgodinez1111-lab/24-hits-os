import { detectInventoryDrift, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Wrapper del worker: detecta drift entre la proyección y el ledger (lógica en
// @24hits/database) y emite una alerta técnica por cada inconsistencia. No corrige
// en silencio (ADR-011).
export async function verifyInventoryDrift(
  prisma: ExtendedPrismaClient,
  logger: Logger
): Promise<number> {
  const drifts = await detectInventoryDrift(prisma);
  for (const d of drifts) {
    logger.error("Drift de inventario detectado", { ...d });
  }
  logger.info("Verificación de drift completada", { drifts: drifts.length });
  return drifts.length;
}
