// Re-exporta el cliente Prisma generado (tipos de modelos, enums, namespace Prisma)
// y los helpers tenant-aware. Único punto de acceso a datos del sistema.
export * from "@prisma/client";
export {
  createPrismaClient,
  withTenant,
  withSystem,
  type ExtendedPrismaClient,
  type TenantTx,
} from "./client.js";
export { MOVEMENT_EFFECTS, type BalanceEffect } from "./inventory-effects.js";
export {
  computeBalanceBuckets,
  type BalanceBuckets,
  type BalanceKeyLite,
} from "./inventory-compute.js";
