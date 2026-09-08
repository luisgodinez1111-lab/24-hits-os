import { autoDraftPurchaseOrdersAllOrgs, type ExtendedPrismaClient } from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Wrapper del worker: deja órdenes de compra en BORRADOR para los faltantes con
// proveedor (lógica compartida en @24hits/database; idempotente, requiere aprobación).
export async function autoDraftPurchaseOrders(prisma: ExtendedPrismaClient, logger: Logger): Promise<number> {
  const created = await autoDraftPurchaseOrdersAllOrgs(prisma);
  if (created > 0) logger.info("Órdenes de compra en borrador generadas", { created });
  return created;
}
