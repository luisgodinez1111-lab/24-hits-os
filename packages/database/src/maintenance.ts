import { Prisma } from "@prisma/client";
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

const DRIFT_DEDUPE_MS = 24 * 60 * 60 * 1000;

// Convierte el drift detectado en una alerta ACCIONABLE: crea una notificación
// INVENTORY_DRIFT crítica por organización afectada (deduplicada 24h para no repetir
// la misma alerta a diario). Sin esto, el descuadre es solo un número que nadie ve.
export async function notifyInventoryDrift(
  prisma: ExtendedPrismaClient,
  drifts: DriftEntry[],
  now: Date = new Date()
): Promise<number> {
  if (drifts.length === 0) return 0;

  const byOrg = new Map<string, number>();
  for (const d of drifts) byOrg.set(d.organizationId, (byOrg.get(d.organizationId) ?? 0) + 1);

  const since = new Date(now.getTime() - DRIFT_DEDUPE_MS);
  let created = 0;
  for (const [organizationId, count] of byOrg) {
    created += await withTenant(prisma, organizationId, async (tx) => {
      const dedupeKey = "inventory-drift";
      const recent = await tx.notification.findFirst({
        where: { organizationId, dedupeKey, createdAt: { gt: since } },
        select: { id: true },
      });
      if (recent) return 0; // ya avisado en las últimas 24h
      await tx.notification.create({
        data: {
          organizationId,
          recipientUserId: null,
          type: "INVENTORY_DRIFT",
          severity: "CRITICAL",
          title: "Descuadre de inventario detectado",
          body: `${count} inconsistencia(s) entre el inventario mostrado y el ledger (fuente de verdad). Revisa y reconstruye los balances afectados.`,
          entityType: "InventoryBalance",
          entityId: null,
          dedupeKey,
        },
      });
      return 1;
    });
  }
  return created;
}

export interface PaymentDriftEntry {
  organizationId: string;
  orderId: string;
  stored: string; // paymentStatus almacenado en el pedido
  expected: string; // recomputado desde los pagos reales
  total: string;
  netPaid: string;
}

// Estados de pedido donde el estado de pago SÍ debe cuadrar con los pagos. DRAFT
// (aún sin cobrar) y CANCELLED (no cobrable) se excluyen.
const PAYMENT_RELEVANT_STATUSES = ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "COMPLETED"] as const;

// Reconciliación de pagos: detecta pedidos cuyo `paymentStatus` guardado NO corresponde
// al recomputado desde sus pagos (Σ COMPLETED). Regla idéntica a PaymentService (ADR-022):
// PAID si neto≥total (total>0); PENDING si neto≤0; si no PARTIAL. Solo LECTURA — reporta,
// no corrige (una corrección automática podría enmascarar un bug o un cobro real).
export async function detectPaymentDrift(prisma: ExtendedPrismaClient): Promise<PaymentDriftEntry[]> {
  const orders = await withSystem(prisma, (tx) =>
    tx.order.findMany({
      where: { status: { in: [...PAYMENT_RELEVANT_STATUSES] } },
      select: { id: true, organizationId: true, total: true, paymentStatus: true },
    })
  );
  if (orders.length === 0) return [];

  // Neto pagado por pedido en UNA consulta (evita N+1).
  const sums = await withSystem(prisma, (tx) =>
    tx.payment.groupBy({
      by: ["orderId"],
      where: { orderId: { in: orders.map((o) => o.id) }, status: "COMPLETED" },
      _sum: { amount: true },
    })
  );
  const netById = new Map(
    sums.map((s) => [s.orderId ?? "", new Prisma.Decimal(s._sum.amount ?? 0)])
  );

  const drifts: PaymentDriftEntry[] = [];
  for (const o of orders) {
    const net = netById.get(o.id) ?? new Prisma.Decimal(0);
    const total = new Prisma.Decimal(o.total);
    const expected = net.gte(total) && total.gt(0) ? "PAID" : net.lte(0) ? "PENDING" : "PARTIAL";
    if (expected !== o.paymentStatus) {
      drifts.push({
        organizationId: o.organizationId,
        orderId: o.id,
        stored: o.paymentStatus,
        expected,
        total: total.toString(),
        netPaid: net.toString(),
      });
    }
  }
  return drifts;
}

// Alerta accionable por descuadre de pagos: notificación crítica por organización
// afectada (deduplicada 24h). Usa el tipo SYSTEM (no hay PAYMENT_DRIFT en el enum).
export async function notifyPaymentDrift(
  prisma: ExtendedPrismaClient,
  drifts: PaymentDriftEntry[],
  now: Date = new Date()
): Promise<number> {
  if (drifts.length === 0) return 0;

  const byOrg = new Map<string, number>();
  for (const d of drifts) byOrg.set(d.organizationId, (byOrg.get(d.organizationId) ?? 0) + 1);

  const since = new Date(now.getTime() - DRIFT_DEDUPE_MS);
  let created = 0;
  for (const [organizationId, count] of byOrg) {
    created += await withTenant(prisma, organizationId, async (tx) => {
      const dedupeKey = "payment-drift";
      const recent = await tx.notification.findFirst({
        where: { organizationId, dedupeKey, createdAt: { gt: since } },
        select: { id: true },
      });
      if (recent) return 0;
      await tx.notification.create({
        data: {
          organizationId,
          recipientUserId: null,
          type: "SYSTEM",
          severity: "CRITICAL",
          title: "Descuadre de pagos detectado",
          body: `${count} pedido(s) con estado de pago que no corresponde a sus pagos registrados. Revisa cobros y reversas.`,
          entityType: "Order",
          entityId: null,
          dedupeKey,
        },
      });
      return 1;
    });
  }
  return created;
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
