import { Injectable } from "@nestjs/common";
import { Prisma, type PurchaseOrderStatus } from "@24hits/database";
import { newId } from "@24hits/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import type { CreatePurchaseOrderInput } from "./purchasing.dto.js";

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.purchaseOrder.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  async get(organizationId: string, id: string) {
    const po = await this.prisma.withTenant(organizationId, (tx) =>
      tx.purchaseOrder.findFirst({ where: { id }, include: { items: true } })
    );
    if (!po) throw AppException.notFound("Orden de compra no encontrada");
    return po;
  }

  async create(organizationId: string, userId: string, input: CreatePurchaseOrderInput) {
    let subtotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    const items = input.items.map((i) => {
      const qty = new Prisma.Decimal(i.orderedQuantity);
      const unit = new Prisma.Decimal(i.unitCost);
      const rate = new Prisma.Decimal(i.taxRate);
      const lineSub = qty.times(unit);
      const lineTax = lineSub.times(rate);
      subtotal = subtotal.plus(lineSub);
      taxTotal = taxTotal.plus(lineTax);
      return { variantId: i.variantId, orderedQuantity: qty, unitCost: unit, taxRate: rate };
    });

    const po = await this.prisma.withTenant(organizationId, async (tx) => {
      const wh = await tx.warehouse.findFirst({ where: { id: input.warehouseId }, select: { branchId: true } });
      if (!wh) throw AppException.badRequest("Almacén no encontrado");
      const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId }, select: { id: true } });
      if (!supplier) throw AppException.badRequest("Proveedor no encontrado");

      return tx.purchaseOrder.create({
        data: {
          organizationId,
          supplierId: input.supplierId,
          warehouseId: input.warehouseId,
          branchId: wh.branchId,
          number: `PO-${newId().slice(0, 8).toUpperCase()}`,
          status: "DRAFT",
          currency: input.currency.toUpperCase(),
          notes: input.notes ?? null,
          expectedDate: input.expectedDate ?? null,
          subtotal,
          taxTotal,
          total: subtotal.plus(taxTotal),
          requestedByUserId: userId,
          correlationId: RequestContext.correlationId(),
          items: { create: items.map((it) => ({ organizationId, ...it })) },
        },
        include: { items: true },
      });
    });
    await this.audit.record({
      action: "purchase_order.created", organizationId, entityType: "PurchaseOrder", entityId: po.id,
      after: { number: po.number, total: po.total.toString(), items: items.length },
    });
    return po;
  }

  submit(organizationId: string, id: string) {
    return this.transition(organizationId, id, ["DRAFT"], "SUBMITTED", "purchase_order.submitted", {});
  }
  approve(organizationId: string, userId: string, id: string) {
    return this.transition(organizationId, id, ["SUBMITTED"], "APPROVED", "purchase_order.approved", { approvedByUserId: userId });
  }
  order(organizationId: string, id: string) {
    return this.transition(organizationId, id, ["APPROVED"], "ORDERED", "purchase_order.ordered", { orderedAt: new Date() });
  }
  cancel(organizationId: string, id: string) {
    return this.transition(organizationId, id, ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED"], "CANCELLED", "purchase_order.cancelled", {});
  }

  private async transition(
    organizationId: string,
    id: string,
    from: PurchaseOrderStatus[],
    to: PurchaseOrderStatus,
    action: string,
    extra: Record<string, unknown>
  ) {
    const updated = await this.prisma.withTenant(organizationId, async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id }, select: { status: true } });
      if (!po) throw AppException.notFound("Orden de compra no encontrada");
      if (!from.includes(po.status)) {
        throw new AppException(409, ErrorCode.PURCHASE_INVALID_STATE, `Transición inválida desde ${po.status}`);
      }
      return tx.purchaseOrder.update({ where: { id }, data: { status: to, ...extra } });
    });
    await this.audit.record({ action, organizationId, entityType: "PurchaseOrder", entityId: id, after: { status: to } });
    return updated;
  }
}
