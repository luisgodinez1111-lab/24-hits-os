import { withSystem, withTenant, type ExtendedPrismaClient } from "./client.js";
import { computeBalanceBuckets } from "./inventory-compute.js";
import { scanLowStockForOrg } from "./notifications.js";

// Redes de seguridad de inventario, cross-tenant y worker-agnósticas (devuelven datos,
// el caller decide cómo registrarlas). Las usan tanto el worker persistente como el
// endpoint de mantenimiento del API disparado por cron gratis.

// Libera reservas vencidas (con expiresAt en el pasado) devolviendo disponibilidad.
// Idempotente: re-verifica ACTIVE dentro de la transacción; nunca toca CONSUMED.
export async function expireDueReservations(
  prisma: ExtendedPrismaClient,
  now: Date = new Date()
): Promise<number> {
  const due = await withSystem(prisma, (tx) =>
    tx.inventoryReservation.findMany({
      where: { status: "ACTIVE", expiresAt: { not: null, lt: now } },
      select: { id: true, organizationId: true, warehouseId: true, variantId: true, quantity: true },
    })
  );

  let released = 0;
  for (const r of due) {
    const ok = await withTenant(prisma, r.organizationId, async (tx) => {
      const fresh = await tx.inventoryReservation.findFirst({ where: { id: r.id, status: "ACTIVE" } });
      if (!fresh) return false; // cambió de estado → idempotente
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
      return true;
    });
    if (ok) released += 1;
  }
  return released;
}

export interface DriftEntry {
  organizationId: string;
  warehouseId: string;
  variantId: string;
  field: string;
  stored: string;
  expected: string;
}

// Compara la proyección InventoryBalance contra el ledger (fuente de verdad) y DEVUELVE
// las inconsistencias. No corrige en silencio (ADR-011): el caller emite la alerta.
export async function detectInventoryDrift(prisma: ExtendedPrismaClient): Promise<DriftEntry[]> {
  const balances = await withSystem(prisma, (tx) =>
    tx.inventoryBalance.findMany({
      select: {
        organizationId: true, warehouseId: true, variantId: true,
        onHand: true, reserved: true, allocated: true, damaged: true, quarantine: true,
      },
    })
  );

  const drifts: DriftEntry[] = [];
  for (const b of balances) {
    const computed = await withTenant(prisma, b.organizationId, (tx) =>
      computeBalanceBuckets(tx, {
        organizationId: b.organizationId,
        warehouseId: b.warehouseId,
        variantId: b.variantId,
      })
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
        drifts.push({
          organizationId: b.organizationId,
          warehouseId: b.warehouseId,
          variantId: b.variantId,
          field, stored, expected,
        });
      }
    }
  }
  return drifts;
}

// Genera notificaciones LOW_STOCK (deduplicadas 24h) para todas las organizaciones
// activas. Devuelve cuántas notificaciones nuevas creó.
export async function scanLowStockAllOrgs(
  prisma: ExtendedPrismaClient,
  now: Date = new Date()
): Promise<number> {
  const orgs = await withSystem(prisma, (tx) =>
    tx.organization.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      select: { id: true },
    })
  );

  let created = 0;
  for (const org of orgs) {
    created += await withTenant(prisma, org.id, (tx) => scanLowStockForOrg(tx, org.id, now));
  }
  return created;
}
