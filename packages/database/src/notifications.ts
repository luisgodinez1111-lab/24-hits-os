import { Prisma } from "@prisma/client";
import type { TenantTx } from "./client.js";

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Disponible = onHand - reserved - allocated - damaged - quarantine (ADR-011).
function available(b: {
  onHand: Prisma.Decimal;
  reserved: Prisma.Decimal;
  allocated: Prisma.Decimal;
  damaged: Prisma.Decimal;
  quarantine: Prisma.Decimal;
}): Prisma.Decimal {
  return new Prisma.Decimal(b.onHand).minus(b.reserved).minus(b.allocated).minus(b.damaged).minus(b.quarantine);
}

// Genera notificaciones LOW_STOCK (difusión a la organización) para las políticas de
// inventario cuyo disponible cae en o por debajo del mínimo. Deduplica por
// (almacén, variante) en una ventana de 24h para no repetir la misma alerta.
// Debe ejecutarse dentro de una transacción de tenant (withTenant). Reutilizado por
// el worker (cron, cross-tenant) y por el endpoint de escaneo bajo demanda (ADR-026).
export async function scanLowStockForOrg(
  tx: TenantTx,
  organizationId: string,
  now: Date = new Date()
): Promise<number> {
  const policies = await tx.inventoryPolicy.findMany({
    where: { organizationId, enabled: true, minimumStock: { gt: 0 } },
    select: { warehouseId: true, variantId: true, minimumStock: true },
  });

  let created = 0;
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS);

  for (const policy of policies) {
    const balance = await tx.inventoryBalance.findFirst({
      where: { organizationId, warehouseId: policy.warehouseId, variantId: policy.variantId },
      select: { onHand: true, reserved: true, allocated: true, damaged: true, quarantine: true },
    });
    const avail = balance ? available(balance) : new Prisma.Decimal(0);
    if (avail.gt(policy.minimumStock)) continue;

    const dedupeKey = `low-stock:${policy.warehouseId}:${policy.variantId}`;
    const recent = await tx.notification.findFirst({
      where: { organizationId, dedupeKey, createdAt: { gt: since } },
      select: { id: true },
    });
    if (recent) continue;

    const variant = await tx.productVariant.findFirst({
      where: { id: policy.variantId },
      select: { sku: true, name: true, product: { select: { name: true } } },
    });
    const label = variant ? `${variant.product.name} · ${variant.name} (${variant.sku})` : "producto";

    await tx.notification.create({
      data: {
        organizationId,
        recipientUserId: null,
        type: "LOW_STOCK",
        severity: avail.lte(0) ? "CRITICAL" : "WARNING",
        title: avail.lte(0) ? "Sin existencias" : "Stock bajo",
        body: `${label}: disponible ${avail.toString()}, mínimo ${policy.minimumStock.toString()}.`,
        entityType: "ProductVariant",
        entityId: policy.variantId,
        dedupeKey,
      },
    });
    created += 1;
  }

  return created;
}
