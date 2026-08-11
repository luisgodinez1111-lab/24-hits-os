import { Injectable } from "@nestjs/common";
import { Prisma, type SaleNote, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import type { CancelSaleNoteInput, IssueSaleNoteInput } from "./sale-note.dto.js";

@Injectable()
export class SaleNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.saleNote.findMany({ orderBy: { issuedAt: "desc" }, take: 100 })
    );
  }

  async get(organizationId: string, id: string) {
    const note = await this.prisma.withTenant(organizationId, (tx) =>
      tx.saleNote.findFirst({ where: { id }, include: { items: true } })
    );
    if (!note) throw new AppException(404, ErrorCode.SALE_NOTE_NOT_FOUND, "Nota de venta no encontrada");
    return note;
  }

  // Asigna el siguiente folio de la serie con bloqueo de fila (UPDATE ... RETURNING).
  // Dos emisiones concurrentes se serializan → folios únicos y sin huecos.
  private async nextFolio(tx: TenantTx, organizationId: string, series: string): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO "DocumentSequence" ("id","organizationId","series","nextValue","updatedAt")
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${series}, 1, now())
      ON CONFLICT ("organizationId","series") DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ folio: number }>>`
      UPDATE "DocumentSequence"
      SET "nextValue" = "nextValue" + 1, "updatedAt" = now()
      WHERE "organizationId" = ${organizationId}::uuid AND "series" = ${series}
      RETURNING ("nextValue" - 1) AS folio`;
    const folio = rows[0]?.folio;
    if (folio == null) throw new Error("No se pudo asignar folio");
    return folio;
  }

  // Emite el comprobante: fotografía cliente, renglones, totales y neto cobrado.
  async issue(organizationId: string, userId: string, input: IssueSaleNoteInput): Promise<SaleNote> {
    const correlationId = RequestContext.correlationId();
    const note = await this.prisma.withTenant(organizationId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.orderId },
        include: { items: true, customer: true },
      });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (order.status === "DRAFT" || order.status === "CANCELLED") {
        throw new AppException(409, ErrorCode.SALE_NOTE_INVALID_STATE, "El pedido no está en un estado facturable");
      }

      // Una sola nota ISSUED por pedido.
      const existing = await tx.saleNote.findFirst({ where: { orderId: order.id, status: "ISSUED" }, select: { id: true } });
      if (existing) throw new AppException(409, ErrorCode.SALE_NOTE_ALREADY_ISSUED, "El pedido ya tiene una nota de venta emitida");

      // Neto cobrado al momento de emitir (snapshot).
      const paidAgg = await tx.payment.aggregate({ where: { orderId: order.id, status: "COMPLETED" }, _sum: { amount: true } });
      const paidTotal = new Prisma.Decimal(paidAgg._sum.amount ?? 0);

      // Descripciones de las variantes para el snapshot de renglones.
      const variantIds = [...new Set(order.items.map((i) => i.variantId))];
      const variants = variantIds.length
        ? await tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, name: true, product: { select: { name: true } } } })
        : [];
      const infoOf = new Map(variants.map((v) => [v.id, { sku: v.sku, description: `${v.product.name} · ${v.name}` }]));

      const folio = await this.nextFolio(tx, organizationId, input.series);
      const number = `${input.series}-${String(folio).padStart(6, "0")}`;

      return tx.saleNote.create({
        data: {
          organizationId,
          branchId: order.branchId,
          orderId: order.id,
          customerId: order.customerId,
          series: input.series,
          folio,
          number,
          status: "ISSUED",
          currency: order.currency,
          customerName: order.customer?.name ?? null,
          customerTaxId: order.customer?.taxId ?? null,
          subtotal: order.subtotal,
          discountTotal: order.discountTotal,
          taxTotal: order.taxTotal,
          total: order.total,
          paidTotal,
          notes: input.notes ?? null,
          issuedByUserId: userId,
          correlationId,
          items: {
            create: order.items.map((i) => ({
              organizationId,
              variantId: i.variantId,
              sku: infoOf.get(i.variantId)?.sku ?? null,
              description: infoOf.get(i.variantId)?.description ?? "Producto",
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount,
              taxRate: i.taxRate,
              lineTotal: i.lineTotal,
            })),
          },
        },
        include: { items: true },
      });
    });

    await this.audit.record({
      action: "sale_note.issued",
      organizationId,
      entityType: "SaleNote",
      entityId: note.id,
      after: { number: note.number, orderId: note.orderId, total: note.total.toString() },
    });
    return note;
  }

  async cancel(organizationId: string, userId: string, id: string, input: CancelSaleNoteInput): Promise<SaleNote> {
    const note = await this.prisma.withTenant(organizationId, async (tx) => {
      const n = await tx.saleNote.findFirst({ where: { id }, select: { id: true, status: true } });
      if (!n) throw new AppException(404, ErrorCode.SALE_NOTE_NOT_FOUND, "Nota de venta no encontrada");
      if (n.status !== "ISSUED") throw new AppException(409, ErrorCode.SALE_NOTE_INVALID_STATE, "La nota no está emitida");
      return tx.saleNote.update({
        where: { id },
        data: { status: "CANCELLED", cancelledByUserId: userId, cancelledAt: new Date(), cancelledReason: input.reason },
      });
    });
    await this.audit.record({
      action: "sale_note.cancelled",
      organizationId,
      entityType: "SaleNote",
      entityId: note.id,
      after: { reason: input.reason },
    });
    return note;
  }
}
