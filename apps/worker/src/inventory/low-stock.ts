import { scanLowStockForOrg, withSystem, withTenant, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Genera notificaciones LOW_STOCK para todas las organizaciones activas. Reutiliza la
// lógica compartida (deduplicada 24h) de @24hits/database (ADR-026). Cross-tenant.
export async function scanLowStock(prisma: ExtendedPrismaClient, logger: Logger): Promise<number> {
  const orgs = await withSystem(prisma, (tx) =>
    tx.organization.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } }, select: { id: true } })
  );

  let created = 0;
  for (const org of orgs) {
    created += await withTenant(prisma, org.id, (tx) => scanLowStockForOrg(tx, org.id));
  }

  if (created > 0) logger.info("Notificaciones de stock bajo generadas", { created });
  return created;
}
