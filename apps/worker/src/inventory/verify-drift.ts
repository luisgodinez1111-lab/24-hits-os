import {
  computeBalanceBuckets,
  withSystem,
  withTenant,
  type ExtendedPrismaClient,
} from "@24hits/database";
import type { Logger } from "@24hits/observability";

// Compara la proyección InventoryBalance contra el ledger (fuente de verdad) y
// REPORTA inconsistencias. No corrige en silencio (ADR-011): emite alerta técnica.
export async function verifyInventoryDrift(
  prisma: ExtendedPrismaClient,
  logger: Logger
): Promise<{ checked: number; drifts: number }> {
  // Escaneo cross-tenant de balances (bypass de RLS).
  const balances = await withSystem(prisma, (tx) =>
    tx.inventoryBalance.findMany({
      select: {
        organizationId: true, warehouseId: true, variantId: true,
        onHand: true, reserved: true, allocated: true, damaged: true, quarantine: true,
      },
    })
  );

  let drifts = 0;
  for (const b of balances) {
    const computed = await withTenant(prisma, b.organizationId, (tx) =>
      computeBalanceBuckets(tx, { organizationId: b.organizationId, warehouseId: b.warehouseId, variantId: b.variantId })
    );
    const fields: Array<[string, string, string]> = [
      ["onHand", b.onHand.toString(), computed.onHand.toString()],
      ["reserved", b.reserved.toString(), computed.reserved.toString()],
      ["allocated", b.allocated.toString(), computed.allocated.toString()],
      ["damaged", b.damaged.toString(), computed.damaged.toString()],
      ["quarantine", b.quarantine.toString(), computed.quarantine.toString()],
    ];
    for (const [field, stored, expected] of fields) {
      if (stored !== expected) {
        drifts += 1;
        logger.error("Drift de inventario detectado", {
          organizationId: b.organizationId, warehouseId: b.warehouseId, variantId: b.variantId,
          field, stored, expected,
        });
      }
    }
  }

  logger.info("Verificación de drift completada", { checked: balances.length, drifts });
  return { checked: balances.length, drifts };
}
