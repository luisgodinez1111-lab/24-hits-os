import { Prisma } from "@prisma/client";
import { withSystem, withTenant, type ExtendedPrismaClient, type TenantTx } from "./client.js";
import { computeBalanceBuckets } from "./inventory-compute.js";
import { scanLowStockForOrg, scanStaleCashSessionsForOrg } from "./notifications.js";

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

// Recordatorio de corte de caja: turnos abiertos demasiado tiempo, cross-tenant.
export async function scanStaleCashSessionsAllOrgs(
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
    created += await withTenant(prisma, org.id, (tx) => scanStaleCashSessionsForOrg(tx, org.id, now));
  }
  return created;
}

// Disponible = onHand − reserved − allocated − damaged − quarantine (ADR-011).
function availableOf(b: { onHand: Prisma.Decimal; reserved: Prisma.Decimal; allocated: Prisma.Decimal; damaged: Prisma.Decimal; quarantine: Prisma.Decimal }): Prisma.Decimal {
  return new Prisma.Decimal(b.onHand).minus(b.reserved).minus(b.allocated).minus(b.damaged).minus(b.quarantine);
}

// Orden de compra en BORRADOR automática: cuando hay productos por debajo de su punto
// de reorden CON proveedor preferido, deja una OC en DRAFT lista para revisar y aprobar
// (agrupada por proveedor+almacén). Es una sugerencia — el DRAFT no toca inventario ni
// dinero hasta que un humano la confirme/reciba. Idempotente: NO recrea si ese
// proveedor+almacén ya tiene una OC en borrador. Se atribuye al dueño (membresía activa
// más antigua). Corre dentro de withTenant.
export async function autoDraftPurchaseOrdersForOrg(
  tx: TenantTx,
  organizationId: string
): Promise<number> {
  // Usuario al que se atribuye la OC (dueño = membresía activa más antigua).
  const owner = await tx.organizationMembership.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return 0;

  const policies = await tx.inventoryPolicy.findMany({
    where: { organizationId, enabled: true, OR: [{ reorderPoint: { gt: 0 } }, { minimumStock: { gt: 0 } }] },
    select: { warehouseId: true, variantId: true, minimumStock: true, reorderPoint: true, targetStock: true },
  });
  if (policies.length === 0) return 0;

  const variantIds = [...new Set(policies.map((p) => p.variantId))];
  // Proveedor preferido por variante (o el primero que exista).
  const refs = await tx.productSupplierReference.findMany({
    where: { organizationId, variantId: { in: variantIds } },
    select: { variantId: true, supplierId: true, isPreferred: true, lastCost: true },
  });
  const refByVariant = new Map<string, (typeof refs)[number]>();
  for (const r of refs) {
    const cur = refByVariant.get(r.variantId);
    if (!cur || (r.isPreferred && !cur.isPreferred)) refByVariant.set(r.variantId, r);
  }
  const costs = await tx.variantCost.findMany({ where: { variantId: { in: variantIds } }, select: { variantId: true, averageCost: true } });
  const avgCost = new Map(costs.map((c) => [c.variantId, c.averageCost]));

  type POItem = { variantId: string; orderedQuantity: Prisma.Decimal; unitCost: Prisma.Decimal; taxRate: Prisma.Decimal };
  const groups = new Map<string, { supplierId: string; warehouseId: string; items: POItem[] }>();
  for (const p of policies) {
    const ref = refByVariant.get(p.variantId);
    if (!ref) continue; // sin proveedor → no se puede ordenar
    const threshold = p.reorderPoint ?? p.minimumStock;
    if (threshold.lte(0)) continue;
    const bal = await tx.inventoryBalance.findFirst({
      where: { organizationId, warehouseId: p.warehouseId, variantId: p.variantId },
      select: { onHand: true, reserved: true, allocated: true, damaged: true, quarantine: true },
    });
    const avail = bal ? availableOf(bal) : new Prisma.Decimal(0);
    if (avail.gt(threshold)) continue; // aún no toca reordenar
    const target = p.targetStock ?? threshold.times(2);
    const qty = Prisma.Decimal.max(new Prisma.Decimal(1), target.minus(avail).ceil());
    const unitCost = ref.lastCost ?? avgCost.get(p.variantId) ?? new Prisma.Decimal(0);
    const key = `${ref.supplierId}:${p.warehouseId}`;
    let g = groups.get(key);
    if (!g) { g = { supplierId: ref.supplierId, warehouseId: p.warehouseId, items: [] }; groups.set(key, g); }
    g.items.push({ variantId: p.variantId, orderedQuantity: qty, unitCost, taxRate: new Prisma.Decimal(0) });
  }
  if (groups.size === 0) return 0;

  // Dedup: proveedor+almacén que YA tiene una OC en borrador (no recrear en cada corrida).
  const supplierIds = [...new Set([...groups.values()].map((g) => g.supplierId))];
  const drafts = await tx.purchaseOrder.findMany({
    where: { organizationId, status: "DRAFT", supplierId: { in: supplierIds } },
    select: { supplierId: true, warehouseId: true },
  });
  const draftKeys = new Set(drafts.map((d) => `${d.supplierId}:${d.warehouseId}`));

  let created = 0;
  for (const [key, g] of groups) {
    if (draftKeys.has(key)) continue;
    const wh = await tx.warehouse.findFirst({ where: { id: g.warehouseId }, select: { branchId: true } });
    if (!wh) continue;
    const supplier = await tx.supplier.findFirst({ where: { id: g.supplierId }, select: { name: true } });
    let subtotal = new Prisma.Decimal(0);
    for (const it of g.items) subtotal = subtotal.plus(it.orderedQuantity.times(it.unitCost));
    const po = await tx.purchaseOrder.create({
      data: {
        organizationId,
        supplierId: g.supplierId,
        warehouseId: g.warehouseId,
        branchId: wh.branchId,
        number: `PO-${crypto.randomUUID().replace(/-/g, "").slice(-12).toUpperCase()}`,
        status: "DRAFT",
        currency: "MXN",
        notes: "Generada automáticamente por punto de reorden — revisar y aprobar.",
        subtotal,
        taxTotal: new Prisma.Decimal(0),
        total: subtotal,
        requestedByUserId: owner.userId,
        items: { create: g.items.map((it) => ({ organizationId, ...it })) },
      },
      select: { id: true },
    });
    await tx.notification.create({
      data: {
        organizationId,
        recipientUserId: null,
        type: "SYSTEM",
        severity: "WARNING",
        title: "Orden de compra sugerida (borrador)",
        body: `Se creó una OC en borrador para ${supplier?.name ?? "un proveedor"} con ${g.items.length} producto(s) por reorden. Revísala y apruébala en Compras → Órdenes de compra.`,
        entityType: "PurchaseOrder",
        entityId: po.id,
        dedupeKey: `auto-po:${po.id}`,
      },
    });
    created += 1;
  }
  return created;
}

// OC en borrador automática, cross-tenant.
export async function autoDraftPurchaseOrdersAllOrgs(prisma: ExtendedPrismaClient): Promise<number> {
  const orgs = await withSystem(prisma, (tx) =>
    tx.organization.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
      select: { id: true },
    })
  );

  let created = 0;
  for (const org of orgs) {
    created += await withTenant(prisma, org.id, (tx) => autoDraftPurchaseOrdersForOrg(tx, org.id));
  }
  return created;
}
