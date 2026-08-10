import { Injectable } from "@nestjs/common";
import { Prisma } from "@24hits/database";
import { newId } from "@24hits/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { LedgerService } from "../inventory/ledger.service.js";
import { CostService } from "../inventory/cost.service.js";
import type { CreateReceiptInput, SupplierReturnInput } from "./purchasing.dto.js";

@Injectable()
export class PurchaseReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly cost: CostService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.purchaseReceipt.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  async get(organizationId: string, id: string) {
    const r = await this.prisma.withTenant(organizationId, (tx) =>
      tx.purchaseReceipt.findFirst({ where: { id }, include: { items: true } })
    );
    if (!r) throw AppException.notFound("Recepción no encontrada");
    return r;
  }

  async create(organizationId: string, userId: string, input: CreateReceiptInput) {
    const receipt = await this.prisma.withTenant(organizationId, async (tx) => {
      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId }, select: { branchId: true } });
      if (!wh) throw AppException.badRequest("Almacén no encontrado");
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId }, select: { id: true } });
      if (!supplier) throw new AppException(400, ErrorCode.SUPPLIER_NOT_FOUND, "Proveedor no encontrado");

      return tx.purchaseReceipt.create({
        data: {
          organizationId,
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          branchId: wh.branchId,
          purchaseOrderId: input.purchaseOrderId ?? null,
          number: `PR-${newId().slice(0, 8).toUpperCase()}`,
          status: "DRAFT",
          notes: input.notes ?? null,
          receivedByUserId: userId,
          idempotencyKey: input.idempotencyKey ?? null,
          correlationId: RequestContext.correlationId(),
          items: {
            create: input.items.map((i) => ({
              organizationId,
              variantId: i.variantId,
              quantity: new Prisma.Decimal(i.quantity),
              unitCost: new Prisma.Decimal(i.unitCost),
              purchaseOrderItemId: i.purchaseOrderItemId ?? null,
            })),
          },
        },
        include: { items: true },
      });
    });
    await this.audit.record({ action: "purchase_receipt.created", organizationId, entityType: "PurchaseReceipt", entityId: receipt.id });
    return receipt;
  }

  // OPERACIÓN CRÍTICA (ADR-019): al postear, cada renglón entra al inventario
  // (PURCHASE_RECEIPT), actualiza el costo promedio móvil y concilia la PO — todo
  // atómico. Doble post bloqueado por estado (idempotente).
  async post(organizationId: string, userId: string, receiptId: string) {
    const correlationId = RequestContext.correlationId();
    await this.prisma.withTenant(organizationId, async (tx) => {
      const receipt = await tx.purchaseReceipt.findFirst({ where: { id: receiptId }, include: { items: true } });
      if (!receipt) throw AppException.notFound("Recepción no encontrada");
      if (receipt.status === "POSTED") {
        throw new AppException(409, ErrorCode.PURCHASE_ALREADY_POSTED, "La recepción ya fue posteada");
      }
      if (receipt.status !== "DRAFT") {
        throw new AppException(409, ErrorCode.PURCHASE_INVALID_STATE, "La recepción no está en DRAFT");
      }

      for (const item of receipt.items) {
        const qty = new Prisma.Decimal(item.quantity);
        const unit = new Prisma.Decimal(item.unitCost);

        // 1) Entrada física al inventario (onHand += qty), snapshot de costo.
        await this.ledger.applyMovement(tx, {
          organizationId,
          branchId: receipt.branchId,
          warehouseId: receipt.warehouseId,
          variantId: item.variantId,
          movementType: "PURCHASE_RECEIPT",
          quantity: qty,
          unitCost: unit,
          totalCost: qty.times(unit),
          referenceType: "PURCHASE_RECEIPT",
          referenceId: receipt.id,
          createdByUserId: userId,
          correlationId,
          idempotencyKey: `receipt:${receipt.id}:${item.id}`,
        });

        // 2) Costo promedio móvil.
        await this.cost.applyInboundCost(tx, {
          organizationId,
          variantId: item.variantId,
          quantity: qty,
          unitCost: unit,
          sourceType: "PURCHASE_RECEIPT",
          changedByUserId: userId,
          correlationId,
        });

        // 3) Último costo en la referencia proveedor↔variante.
        await tx.productSupplierReference.updateMany({
          where: { supplierId: receipt.supplierId, variantId: item.variantId },
          data: { lastCost: unit },
        });

        // 4) Conciliación con el renglón de la PO.
        if (item.purchaseOrderItemId) {
          await tx.purchaseOrderItem.update({
            where: { id: item.purchaseOrderItemId },
            data: { receivedQuantity: { increment: qty } },
          });
        }
      }

      // 5) Estado de la PO (parcial/total).
      if (receipt.purchaseOrderId) {
        const poItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: receipt.purchaseOrderId } });
        const allReceived = poItems.every((it) => new Prisma.Decimal(it.receivedQuantity).gte(it.orderedQuantity));
        await tx.purchaseOrder.update({
          where: { id: receipt.purchaseOrderId },
          data: { status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
        });
      }

      await tx.purchaseReceipt.update({ where: { id: receiptId }, data: { status: "POSTED", postedAt: new Date() } });
    });

    await this.audit.record({ action: "purchase.received", organizationId, entityType: "PurchaseReceipt", entityId: receiptId });
    return this.get(organizationId, receiptId);
  }

  // Devolución a proveedor: SUPPLIER_RETURN (onHand -qty). No es un borrado.
  async supplierReturn(organizationId: string, userId: string, input: SupplierReturnInput) {
    const correlationId = RequestContext.correlationId();
    const movement = await this.prisma.withTenant(organizationId, async (tx) => {
      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId }, select: { branchId: true } });
      if (!wh) throw AppException.badRequest("Almacén no encontrado");
      const { movement } = await this.ledger.applyMovement(tx, {
        organizationId,
        branchId: wh.branchId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        movementType: "SUPPLIER_RETURN",
        quantity: input.quantity,
        reasonText: input.reasonText,
        referenceType: "SUPPLIER",
        referenceId: input.supplierId,
        createdByUserId: userId,
        correlationId,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      await this.cost.reduceOnOutbound(tx, input.variantId, input.quantity);
      return movement;
    });
    await this.audit.record({ action: "supplier.return", organizationId, entityType: "InventoryMovement", entityId: movement.id, after: { supplierId: input.supplierId, quantity: String(input.quantity) } });
    return movement;
  }
}
