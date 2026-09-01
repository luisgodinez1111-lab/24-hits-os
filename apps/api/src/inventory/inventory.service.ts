import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type MovementDirection,
  type ReasonCode,
  type TenantTx,
} from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { BalanceService } from "./balance.service.js";
import { LedgerService } from "./ledger.service.js";
import { CostService } from "./cost.service.js";

// Umbral de aprobación de ajustes manuales (unidades). Configurable a futuro vía
// OrganizationSettings; por ahora constante segura. Separación de funciones: quien
// solicita no puede aprobar su propio ajuste.
const ADJUSTMENT_APPROVAL_THRESHOLD = new Prisma.Decimal(100);

export interface OpeningBalanceInput {
  warehouseId: string;
  variantId: string;
  quantity: number | string;
  unitCost?: number | string | null;
  idempotencyKey?: string | null;
}

export interface ManualAdjustmentInput {
  warehouseId: string;
  variantId: string;
  quantity: number | string;
  direction: MovementDirection;
  reasonCode: ReasonCode;
  reasonText: string;
  idempotencyKey?: string | null;
}

export interface DamageInput {
  warehouseId: string;
  variantId: string;
  quantity: number | string;
  reasonText: string;
  idempotencyKey?: string | null;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly cost: CostService,
    private readonly balances: BalanceService,
    private readonly audit: AuditService
  ) {}

  private async resolveBranchId(tx: TenantTx, warehouseId: string): Promise<string> {
    const wh = await tx.warehouse.findFirst({ where: { id: warehouseId }, select: { branchId: true } });
    if (!wh) throw AppException.notFound("Almacén no encontrado");
    return wh.branchId;
  }

  private async assertVariant(tx: TenantTx, variantId: string): Promise<void> {
    const v = await tx.productVariant.findFirst({ where: { id: variantId }, select: { id: true } });
    if (!v) throw new AppException(404, ErrorCode.VARIANT_NOT_FOUND, "Variante no encontrada");
  }

  // Saldo inicial: movimiento OPENING_BALANCE (idempotente) + inicialización de costo.
  async openingBalance(organizationId: string, userId: string, input: OpeningBalanceInput) {
    const correlationId = RequestContext.correlationId();
    const result = await this.prisma.withTenant(organizationId, async (tx) => {
      await this.assertVariant(tx, input.variantId);
      const branchId = await this.resolveBranchId(tx, input.warehouseId);
      const qty = new Prisma.Decimal(input.quantity);

      const applied = await this.ledger.applyMovement(tx, {
        organizationId,
        branchId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        movementType: "OPENING_BALANCE",
        quantity: qty,
        unitCost: input.unitCost ?? null,
        totalCost: input.unitCost ? qty.times(input.unitCost) : null,
        reasonCode: "INITIAL_COUNT",
        createdByUserId: userId,
        correlationId,
        idempotencyKey: input.idempotencyKey ?? null,
      });

      if (!applied.idempotentReplay && input.unitCost != null) {
        await this.cost.applyInboundCost(tx, {
          organizationId,
          variantId: input.variantId,
          quantity: qty,
          unitCost: input.unitCost,
          sourceType: "OPENING_BALANCE",
          changedByUserId: userId,
          correlationId,
        });
      }
      return applied;
    });

    if (!result.idempotentReplay) {
      await this.audit.record({
        action: "inventory.opening_balance",
        organizationId,
        entityType: "InventoryMovement",
        entityId: result.movement.id,
        after: { variantId: input.variantId, warehouseId: input.warehouseId, quantity: String(input.quantity) },
      });
    }
    return result.movement;
  }

  // Ajuste manual. Si supera el umbral, crea AdjustmentRequest PENDING (requiere
  // aprobación por otra persona); si no, se aplica de inmediato.
  async manualAdjustment(organizationId: string, userId: string, input: ManualAdjustmentInput) {
    const qty = new Prisma.Decimal(input.quantity);
    if (qty.lte(0)) throw new AppException(400, ErrorCode.INVENTORY_ADJUSTMENT_INVALID, "Cantidad inválida");
    if (!input.reasonText.trim()) {
      throw new AppException(400, ErrorCode.INVENTORY_ADJUSTMENT_INVALID, "El motivo es obligatorio");
    }

    if (qty.gt(ADJUSTMENT_APPROVAL_THRESHOLD)) {
      const request = await this.prisma.withTenant(organizationId, async (tx) => {
        const branchId = await this.resolveBranchId(tx, input.warehouseId);
        return tx.adjustmentRequest.create({
          data: {
            organizationId,
            branchId,
            warehouseId: input.warehouseId,
            variantId: input.variantId,
            quantity: qty,
            direction: input.direction,
            reasonCode: input.reasonCode,
            reasonText: input.reasonText,
            status: "PENDING",
            sourceType: "MANUAL",
            requestedByUserId: userId,
            idempotencyKey: input.idempotencyKey ?? null,
          },
        });
      });
      await this.audit.record({
        action: "inventory.adjustment_requested",
        organizationId,
        entityType: "AdjustmentRequest",
        entityId: request.id,
        after: { quantity: qty.toString(), direction: input.direction, reason: input.reasonCode },
      });
      return { requiresApproval: true, adjustmentRequestId: request.id };
    }

    const movement = await this.applyAdjustmentMovement(organizationId, userId, {
      warehouseId: input.warehouseId,
      variantId: input.variantId,
      quantity: qty,
      direction: input.direction,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
      idempotencyKey: input.idempotencyKey ?? null,
      approvedByUserId: null,
    });
    await this.audit.record({
      action: "inventory.adjusted",
      organizationId,
      entityType: "InventoryMovement",
      entityId: movement.id,
      after: { quantity: qty.toString(), direction: input.direction, reason: input.reasonCode },
    });
    return { requiresApproval: false, movementId: movement.id };
  }

  async approveAdjustment(organizationId: string, approverUserId: string, requestId: string) {
    const request = await this.prisma.client.adjustmentRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) throw AppException.notFound("Solicitud de ajuste no encontrada");
    if (request.status !== "PENDING") {
      throw new AppException(409, ErrorCode.INVENTORY_ADJUSTMENT_INVALID, "La solicitud no está pendiente");
    }
    // Separación de funciones: quien solicita no puede aprobar.
    if (request.requestedByUserId === approverUserId) {
      throw AppException.forbidden("No puedes aprobar tu propia solicitud de ajuste");
    }

    const movement = await this.applyAdjustmentMovement(organizationId, request.requestedByUserId, {
      warehouseId: request.warehouseId,
      variantId: request.variantId,
      quantity: new Prisma.Decimal(request.quantity),
      direction: request.direction,
      reasonCode: request.reasonCode,
      reasonText: request.reasonText,
      idempotencyKey: request.idempotencyKey,
      approvedByUserId: approverUserId,
    });
    await this.prisma.client.adjustmentRequest.update({
      where: { id: request.id },
      data: { status: "APPLIED", approvedByUserId: approverUserId, appliedMovementId: movement.id },
    });
    await this.audit.record({
      action: "inventory.adjustment_approved",
      organizationId,
      entityType: "AdjustmentRequest",
      entityId: request.id,
      after: { movementId: movement.id },
    });
    return { movementId: movement.id };
  }

  private applyAdjustmentMovement(
    organizationId: string,
    createdByUserId: string,
    p: {
      warehouseId: string;
      variantId: string;
      quantity: Prisma.Decimal;
      direction: MovementDirection;
      reasonCode: ReasonCode;
      reasonText: string;
      idempotencyKey: string | null;
      approvedByUserId: string | null;
    }
  ) {
    const correlationId = RequestContext.correlationId();
    return this.prisma.withTenant(organizationId, async (tx) => {
      const branchId = await this.resolveBranchId(tx, p.warehouseId);
      const { movement } = await this.ledger.applyMovement(tx, {
        organizationId,
        branchId,
        warehouseId: p.warehouseId,
        variantId: p.variantId,
        movementType: p.direction === "IN" ? "MANUAL_IN" : "MANUAL_OUT",
        quantity: p.quantity,
        reasonCode: p.reasonCode,
        reasonText: p.reasonText,
        createdByUserId,
        approvedByUserId: p.approvedByUserId,
        correlationId,
        idempotencyKey: p.idempotencyKey,
      });
      return movement;
    });
  }

  // Marca inventario como dañado (onHand -> damaged), no desaparece.
  async markAsDamaged(organizationId: string, userId: string, input: DamageInput) {
    const correlationId = RequestContext.correlationId();
    const movement = await this.prisma.withTenant(organizationId, async (tx) => {
      const branchId = await this.resolveBranchId(tx, input.warehouseId);
      const { movement } = await this.ledger.applyMovement(tx, {
        organizationId,
        branchId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        movementType: "DAMAGE",
        quantity: input.quantity,
        reasonCode: "DAMAGE",
        reasonText: input.reasonText,
        createdByUserId: userId,
        correlationId,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      return movement;
    });
    await this.audit.record({
      action: "inventory.damaged",
      organizationId,
      entityType: "InventoryMovement",
      entityId: movement.id,
      after: { variantId: input.variantId, quantity: String(input.quantity) },
    });
    return movement;
  }

  async setQuarantine(
    organizationId: string,
    userId: string,
    input: DamageInput,
    toQuarantine: boolean
  ) {
    const correlationId = RequestContext.correlationId();
    return this.prisma.withTenant(organizationId, async (tx) => {
      const branchId = await this.resolveBranchId(tx, input.warehouseId);
      const { movement } = await this.ledger.applyMovement(tx, {
        organizationId,
        branchId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        movementType: toQuarantine ? "QUARANTINE_IN" : "QUARANTINE_OUT",
        quantity: input.quantity,
        reasonText: input.reasonText,
        createdByUserId: userId,
        correlationId,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      return movement;
    });
  }

  // --- Lecturas ---

  async listBalances(
    organizationId: string,
    filters: { warehouseId?: string; variantId?: string; lowStock?: boolean }
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const balances = await tx.inventoryBalance.findMany({
        where: {
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
          ...(filters.variantId ? { variantId: filters.variantId } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 1000,
      });
      const variantIds = [...new Set(balances.map((b) => b.variantId))];
      const warehouseIds = [...new Set(balances.map((b) => b.warehouseId))];
      const [variants, policies, warehouses] = await Promise.all([
        tx.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, sku: true, name: true, product: { select: { name: true } }, flavor: { select: { name: true } } },
        }),
        tx.inventoryPolicy.findMany({ where: { variantId: { in: variantIds } } }),
        tx.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true } }),
      ]);
      const vMap = new Map(variants.map((v) => [v.id, v]));
      const pMap = new Map(policies.map((p) => [`${p.warehouseId}:${p.variantId}`, p]));
      const whMap = new Map(warehouses.map((w) => [w.id, w.name]));

      const rows = balances.map((b) => {
        const available = this.balances.available(b);
        const policy = pMap.get(`${b.warehouseId}:${b.variantId}`);
        const min = policy ? new Prisma.Decimal(policy.minimumStock) : null;
        const reorderStatus = min && available.lte(min) ? (available.lte(0) ? "OUT_OF_STOCK" : "LOW") : "OK";
        return {
          variantId: b.variantId,
          warehouseId: b.warehouseId,
          warehouseName: whMap.get(b.warehouseId) ?? null,
          sku: vMap.get(b.variantId)?.sku ?? null,
          product: vMap.get(b.variantId)?.product?.name ?? null,
          flavor: vMap.get(b.variantId)?.flavor?.name ?? null,
          onHand: b.onHand,
          reserved: b.reserved,
          allocated: b.allocated,
          damaged: b.damaged,
          quarantine: b.quarantine,
          inTransitIncoming: b.inTransitIncoming,
          inTransitOutgoing: b.inTransitOutgoing,
          available: available.toString(),
          minimumStock: min?.toString() ?? null,
          reorderStatus,
        };
      });
      return rows.filter((r) => (filters.lowStock ? r.reorderStatus !== "OK" : true));
    });
  }

  listMovements(
    organizationId: string,
    filters: { variantId?: string; warehouseId?: string; limit: number; cursor?: string }
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const items = await tx.inventoryMovement.findMany({
        where: {
          ...(filters.variantId ? { variantId: filters.variantId } : {}),
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: filters.limit + 1,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > filters.limit;
      const page = hasMore ? items.slice(0, filters.limit) : items;
      return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
    });
  }

  // Valor de inventario = Σ onHand * averageCost (requiere costs.read en el controller).
  async inventoryValue(organizationId: string, warehouseId?: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const balances = await tx.inventoryBalance.findMany({
        where: warehouseId ? { warehouseId } : {},
        select: { variantId: true, onHand: true },
      });
      const costs = await tx.variantCost.findMany({
        where: { variantId: { in: [...new Set(balances.map((b) => b.variantId))] } },
        select: { variantId: true, averageCost: true },
      });
      const costMap = new Map(costs.map((c) => [c.variantId, new Prisma.Decimal(c.averageCost)]));
      let total = new Prisma.Decimal(0);
      for (const b of balances) {
        total = total.plus(new Prisma.Decimal(b.onHand).times(costMap.get(b.variantId) ?? 0));
      }
      return { value: total.toFixed(4), currency: "MXN" };
    });
  }

  // Capital atrapado: variantes con existencias (onHand>0) SIN venta (SALE) en los
  // últimos `days` días. Es dinero parado en stock que no rota. Se valora con el costo
  // promedio y se ordena por valor atrapado (lo más caro parado primero).
  async slowMovers(organizationId: string, days = 60, limit = 20) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const since = new Date(Date.now() - days * 86_400_000);
      const empty = { days, items: [] as unknown[], trappedTotal: "0", currency: "MXN" };

      const balances = await tx.inventoryBalance.findMany({
        where: { onHand: { gt: 0 } },
        select: { variantId: true, onHand: true },
      });
      if (balances.length === 0) return empty;

      const variantIds = [...new Set(balances.map((b) => b.variantId))];
      // Variantes CON venta reciente → no son capital atrapado.
      const recentSales = await tx.inventoryMovement.findMany({
        where: { variantId: { in: variantIds }, movementType: "SALE", createdAt: { gte: since } },
        select: { variantId: true },
        distinct: ["variantId"],
      });
      const sold = new Set(recentSales.map((m) => m.variantId));

      // Suma onHand por variante lenta (a través de almacenes).
      const byVariant = new Map<string, Prisma.Decimal>();
      for (const b of balances) {
        if (sold.has(b.variantId)) continue;
        byVariant.set(b.variantId, (byVariant.get(b.variantId) ?? new Prisma.Decimal(0)).plus(b.onHand));
      }
      if (byVariant.size === 0) return empty;

      const [costs, variants] = await Promise.all([
        tx.variantCost.findMany({
          where: { variantId: { in: [...byVariant.keys()] } },
          select: { variantId: true, averageCost: true },
        }),
        tx.productVariant.findMany({
          where: { id: { in: [...byVariant.keys()] } },
          select: { id: true, sku: true, name: true, product: { select: { name: true } } },
        }),
      ]);
      const costMap = new Map(costs.map((c) => [c.variantId, new Prisma.Decimal(c.averageCost)]));
      const vMap = new Map(variants.map((v) => [v.id, v]));

      let trappedTotal = new Prisma.Decimal(0);
      const items = [...byVariant.entries()]
        .map(([variantId, onHand]) => {
          const value = onHand.times(costMap.get(variantId) ?? 0);
          trappedTotal = trappedTotal.plus(value);
          const v = vMap.get(variantId);
          return {
            variantId,
            name: v ? `${v.product.name} · ${v.name}` : variantId.slice(0, 8),
            sku: v?.sku ?? null,
            onHand: onHand.toString(),
            value: value.toFixed(4),
          };
        })
        .sort((a, b) => Number(b.value) - Number(a.value))
        .slice(0, limit);

      return { days, items, trappedTotal: trappedTotal.toFixed(4), currency: "MXN" };
    });
  }

  async dashboard(organizationId: string, canReadCosts: boolean) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const [totalVariants, balances] = await Promise.all([
        tx.productVariant.count(),
        tx.inventoryBalance.findMany({ select: { onHand: true, reserved: true, allocated: true, damaged: true, quarantine: true, warehouseId: true, variantId: true } }),
      ]);
      const policies = await tx.inventoryPolicy.findMany();
      const pMap = new Map(policies.map((p) => [`${p.warehouseId}:${p.variantId}`, new Prisma.Decimal(p.minimumStock)]));
      let low = 0;
      let out = 0;
      for (const b of balances) {
        const available = new Prisma.Decimal(b.onHand).minus(b.reserved).minus(b.allocated).minus(b.damaged).minus(b.quarantine);
        if (available.lte(0)) out += 1;
        else {
          const min = pMap.get(`${b.warehouseId}:${b.variantId}`);
          if (min && available.lte(min)) low += 1;
        }
      }
      const base = { totalVariants, lowStock: low, outOfStock: out };
      if (!canReadCosts) return base;
      const value = await this.inventoryValue(organizationId);
      return { ...base, inventoryValue: value.value, currency: value.currency };
    });
  }

  // --- Integridad: rebuild y drift (ADR-011) ---

  async rebuildBalances(organizationId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const combos = await tx.inventoryBalance.findMany({
        select: { organizationId: true, branchId: true, warehouseId: true, variantId: true },
      });
      for (const c of combos) await this.balances.rebuild(tx, c);
      return { rebuilt: combos.length };
    });
  }

  async verifyDrift(organizationId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const balances = await tx.inventoryBalance.findMany();
      const drifts: Array<{ warehouseId: string; variantId: string; field: string; stored: string; computed: string }> = [];
      for (const b of balances) {
        const c = await this.balances.computeFromLedger(tx, b);
        const checks: Array<[string, Prisma.Decimal, Prisma.Decimal]> = [
          ["onHand", new Prisma.Decimal(b.onHand), c.onHand],
          ["reserved", new Prisma.Decimal(b.reserved), c.reserved],
          ["allocated", new Prisma.Decimal(b.allocated), c.allocated],
          ["damaged", new Prisma.Decimal(b.damaged), c.damaged],
          ["quarantine", new Prisma.Decimal(b.quarantine), c.quarantine],
        ];
        for (const [field, stored, computed] of checks) {
          if (!stored.equals(computed)) {
            drifts.push({ warehouseId: b.warehouseId, variantId: b.variantId, field, stored: stored.toString(), computed: computed.toString() });
          }
        }
      }
      return { ok: drifts.length === 0, drifts };
    });
  }
}
