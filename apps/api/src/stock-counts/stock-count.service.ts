import { Injectable } from "@nestjs/common";
import { Prisma, type StockCountStatus } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { LedgerService } from "../inventory/ledger.service.js";
import type { CaptureCountsInput, CreateStockCountInput } from "./stock-count.dto.js";

@Injectable()
export class StockCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.stockCount.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  // Oculta expectedQuantity/difference en conteo ciego mientras se está contando.
  async get(organizationId: string, id: string) {
    const count = await this.prisma.withTenant(organizationId, (tx) =>
      tx.stockCount.findFirst({ where: { id }, include: { items: true } })
    );
    if (!count) throw AppException.notFound("Conteo no encontrado");
    const hide = count.blindCount && (count.status === "IN_PROGRESS" || count.status === "DRAFT");
    if (hide) {
      return { ...count, items: count.items.map((i) => ({ ...i, expectedQuantity: null, difference: null })) };
    }
    return count;
  }

  async create(organizationId: string, userId: string, input: CreateStockCountInput) {
    const branchId = await this.prisma.withTenant(organizationId, async (tx) => {
      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId }, select: { branchId: true } });
      if (!wh) throw AppException.badRequest("Almacén no encontrado");
      return wh.branchId;
    });

    const count = await this.prisma.withTenant(organizationId, (tx) =>
      tx.stockCount.create({
        data: {
          organizationId,
          branchId,
          warehouseId: input.warehouseId,
          type: input.type,
          blindCount: input.blindCount,
          notes: input.notes ?? null,
          status: "DRAFT",
          items: {
            create: input.variantIds.map((variantId) => ({
              organizationId,
              variantId,
              expectedQuantity: 0,
            })),
          },
        },
        include: { items: true },
      })
    );
    await this.audit.record({ action: "stock_count.created", organizationId, entityType: "StockCount", entityId: count.id });
    return count;
  }

  // Inicia: snapshot de expectedQuantity = onHand actual por variante.
  async start(organizationId: string, userId: string, id: string) {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id }, include: { items: true } });
      if (!count) throw AppException.notFound("Conteo no encontrado");
      if (count.status !== "DRAFT") {
        throw new AppException(409, ErrorCode.STOCK_COUNT_INVALID_STATE, "El conteo debe estar en DRAFT");
      }
      for (const item of count.items) {
        const bal = await tx.inventoryBalance.findUnique({
          where: {
            organizationId_warehouseId_variantId: {
              organizationId, warehouseId: count.warehouseId, variantId: item.variantId,
            },
          },
          select: { onHand: true },
        });
        await tx.stockCountItem.update({
          where: { id: item.id },
          data: { expectedQuantity: bal?.onHand ?? new Prisma.Decimal(0) },
        });
      }
      await tx.stockCount.update({ where: { id }, data: { status: "IN_PROGRESS", startedByUserId: userId, startedAt: new Date() } });
    });
    await this.audit.record({ action: "stock_count.started", organizationId, entityType: "StockCount", entityId: id });
    return this.get(organizationId, id);
  }

  async capture(organizationId: string, id: string, input: CaptureCountsInput) {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id }, select: { status: true } });
      if (!count) throw AppException.notFound("Conteo no encontrado");
      if (count.status !== "IN_PROGRESS") {
        throw new AppException(409, ErrorCode.STOCK_COUNT_INVALID_STATE, "El conteo no está en progreso");
      }
      for (const c of input.items) {
        await tx.stockCountItem.update({
          where: { id: c.itemId },
          data: { countedQuantity: new Prisma.Decimal(c.countedQuantity), countedAt: new Date() },
        });
      }
    });
    return this.get(organizationId, id);
  }

  // Envía: calcula difference = counted - expected por renglón.
  async submit(organizationId: string, id: string) {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id }, include: { items: true } });
      if (!count) throw AppException.notFound("Conteo no encontrado");
      if (count.status !== "IN_PROGRESS") {
        throw new AppException(409, ErrorCode.STOCK_COUNT_INVALID_STATE, "El conteo no está en progreso");
      }
      for (const item of count.items) {
        const counted = new Prisma.Decimal(item.countedQuantity ?? 0);
        const difference = counted.minus(item.expectedQuantity);
        await tx.stockCountItem.update({ where: { id: item.id }, data: { difference } });
      }
      await tx.stockCount.update({ where: { id }, data: { status: "SUBMITTED", completedAt: new Date() } });
    });
    await this.audit.record({ action: "stock_count.submitted", organizationId, entityType: "StockCount", entityId: id });
    return this.get(organizationId, id);
  }

  async approve(organizationId: string, userId: string, id: string) {
    const count = await this.prisma.withTenant(organizationId, (tx) => tx.stockCount.findFirst({ where: { id } }));
    if (!count) throw AppException.notFound("Conteo no encontrado");
    if (count.status !== "SUBMITTED") {
      throw new AppException(409, ErrorCode.STOCK_COUNT_INVALID_STATE, "El conteo debe estar SUBMITTED");
    }
    // Separación de funciones: quien inició no puede aprobar.
    if (count.startedByUserId === userId) {
      throw AppException.forbidden("No puedes aprobar un conteo que iniciaste");
    }
    await this.prisma.withTenant(organizationId, (tx) =>
      tx.stockCount.update({ where: { id }, data: { status: "APPROVED", approvedByUserId: userId, approvedAt: new Date() } })
    );
    await this.audit.record({ action: "stock_count.approved", organizationId, entityType: "StockCount", entityId: id });
    return this.get(organizationId, id);
  }

  // Aplica: genera COUNT_ADJUSTMENT_IN/OUT por diferencia. Inmutable tras APPLIED.
  async apply(organizationId: string, userId: string, id: string) {
    const correlationId = RequestContext.correlationId();
    await this.prisma.withTenant(organizationId, async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id }, include: { items: true } });
      if (!count) throw AppException.notFound("Conteo no encontrado");
      if (count.status === "APPLIED") {
        throw new AppException(409, ErrorCode.STOCK_COUNT_ALREADY_APPLIED, "El conteo ya fue aplicado");
      }
      if (count.status !== "APPROVED") {
        throw new AppException(409, ErrorCode.STOCK_COUNT_INVALID_STATE, "El conteo debe estar APPROVED para aplicarse");
      }

      for (const item of count.items) {
        const diff = new Prisma.Decimal(item.difference ?? 0);
        if (diff.isZero()) continue;
        await this.ledger.applyMovement(tx, {
          organizationId,
          branchId: count.branchId,
          warehouseId: count.warehouseId,
          variantId: item.variantId,
          movementType: diff.gt(0) ? "COUNT_ADJUSTMENT_IN" : "COUNT_ADJUSTMENT_OUT",
          quantity: diff.abs(),
          reasonCode: "COUNT_DIFFERENCE",
          reasonText: `Ajuste por conteo ${id}`,
          referenceType: "STOCK_COUNT",
          referenceId: id,
          createdByUserId: userId,
          correlationId,
          idempotencyKey: `count:${id}:${item.id}`,
        });
      }
      await tx.stockCount.update({ where: { id }, data: { status: "APPLIED" } });
    });
    await this.audit.record({ action: "stock_count.applied", organizationId, entityType: "StockCount", entityId: id });
    return this.get(organizationId, id);
  }

  async cancel(organizationId: string, id: string) {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id }, select: { status: true } });
      if (!count) throw AppException.notFound("Conteo no encontrado");
      const cancellable: StockCountStatus[] = ["DRAFT", "IN_PROGRESS", "SUBMITTED"];
      if (!cancellable.includes(count.status)) {
        throw new AppException(409, ErrorCode.STOCK_COUNT_INVALID_STATE, "No se puede cancelar en este estado");
      }
      await tx.stockCount.update({ where: { id }, data: { status: "CANCELLED" } });
    });
    return this.get(organizationId, id);
  }
}
