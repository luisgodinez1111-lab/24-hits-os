import { Injectable } from "@nestjs/common";
import { Prisma, type CreditNote, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { LedgerService } from "../inventory/ledger.service.js";
import { CostService } from "../inventory/cost.service.js";
import type { IssueCreditNoteInput } from "./credit-note.dto.js";

interface CreditLine {
  saleNoteItemId: string;
  variantId: string | null;
  sku: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  unitCostSnapshot: Prisma.Decimal | null;
}

@Injectable()
export class CreditNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly cost: CostService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.creditNote.findMany({ orderBy: { issuedAt: "desc" }, take: 100 })
    );
  }

  async get(organizationId: string, id: string) {
    const note = await this.prisma.withTenant(organizationId, (tx) =>
      tx.creditNote.findFirst({ where: { id }, include: { items: true } })
    );
    if (!note) throw new AppException(404, ErrorCode.CREDIT_NOTE_NOT_FOUND, "Nota de crédito no encontrada");
    return note;
  }

  // Folio consecutivo por serie con bloqueo de fila (idéntico a la nota de venta).
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

  // Emite la devolución: reingresa inventario (CUSTOMER_RETURN), revierte el COGS al
  // costo capturado en la venta y documenta el crédito. Reembolso opcional (ADR-025).
  async issue(organizationId: string, userId: string, input: IssueCreditNoteInput): Promise<CreditNote> {
    const correlationId = RequestContext.correlationId();
    const note = await this.prisma.withTenant(organizationId, async (tx) => {
      const saleNote = await tx.saleNote.findFirst({
        where: { id: input.saleNoteId },
        include: { items: true, order: { select: { id: true, warehouseId: true, branchId: true } } },
      });
      if (!saleNote) throw new AppException(404, ErrorCode.SALE_NOTE_NOT_FOUND, "Nota de venta no encontrada");
      if (saleNote.status !== "ISSUED") throw new AppException(409, ErrorCode.SALE_NOTE_INVALID_STATE, "La nota de venta no está vigente");
      if (!saleNote.order) throw new AppException(409, ErrorCode.SALE_NOTE_INVALID_STATE, "La nota no tiene pedido asociado para reingresar stock");
      const warehouseId = saleNote.order.warehouseId;

      // Reembolso en efectivo: turno OPCIONAL. Si se indica uno, validar que esté
      // abierto (el retiro se registra en el cajón); si no, el reembolso se documenta igual.
      if (input.refundMethod === "CASH" && input.refundCashSessionId) {
        const session = await tx.cashSession.findFirst({ where: { id: input.refundCashSessionId }, select: { status: true } });
        if (!session) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");
        if (session.status !== "OPEN") throw new AppException(409, ErrorCode.CASH_SESSION_NOT_OPEN, "El turno de caja no está abierto");
      }

      const itemById = new Map(saleNote.items.map((i) => [i.id, i]));
      const ids = input.items.map((i) => i.saleNoteItemId);
      const priorReturns = await tx.creditNoteItem.findMany({
        where: { saleNoteItemId: { in: ids }, creditNote: { status: "ISSUED" } },
        select: { saleNoteItemId: true, quantity: true },
      });
      const returnedMap = new Map<string, Prisma.Decimal>();
      for (const r of priorReturns) {
        if (!r.saleNoteItemId) continue;
        returnedMap.set(r.saleNoteItemId, (returnedMap.get(r.saleNoteItemId) ?? new Prisma.Decimal(0)).plus(r.quantity));
      }

      const lines: CreditLine[] = [];
      let subtotal = new Prisma.Decimal(0);
      let discountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      let total = new Prisma.Decimal(0);

      for (const req of input.items) {
        const sni = itemById.get(req.saleNoteItemId);
        if (!sni) throw new AppException(404, ErrorCode.SALE_NOTE_ITEM_NOT_FOUND, "Renglón de la nota de venta no encontrado");

        const qty = new Prisma.Decimal(req.quantity);
        const sold = new Prisma.Decimal(sni.quantity);
        const already = returnedMap.get(req.saleNoteItemId) ?? new Prisma.Decimal(0);
        if (already.plus(qty).gt(sold)) {
          throw new AppException(409, ErrorCode.RETURN_EXCEEDS_SOLD, `La devolución excede lo vendido en el renglón ${sni.description}`);
        }

        const unitCost = sni.unitCostSnapshot != null ? new Prisma.Decimal(sni.unitCostSnapshot) : null;

        // Reingreso físico + reverso de COGS (solo si hay variante y costo capturado).
        if (sni.variantId) {
          await this.ledger.applyMovement(tx, {
            organizationId,
            branchId: saleNote.branchId,
            warehouseId,
            variantId: sni.variantId,
            movementType: "CUSTOMER_RETURN",
            quantity: qty,
            unitCost: unitCost ?? undefined,
            totalCost: unitCost ? unitCost.times(qty) : undefined,
            referenceType: "CREDIT_NOTE",
            referenceId: saleNote.id,
            createdByUserId: userId,
            correlationId,
          });
          if (unitCost) {
            await this.cost.applyInboundCost(tx, {
              organizationId,
              variantId: sni.variantId,
              quantity: qty,
              unitCost,
              sourceType: "SALE_RETURN",
              changedByUserId: userId,
              correlationId,
            });
          }
        }

        // Crédito proporcional a la cantidad devuelta (descuento prorrateado).
        const base = new Prisma.Decimal(sni.unitPrice).times(qty);
        const disc = new Prisma.Decimal(sni.discount).times(qty).dividedBy(sold);
        const net = base.minus(disc);
        const tax = net.times(sni.taxRate);
        const lineTotal = net.plus(tax);
        subtotal = subtotal.plus(base);
        discountTotal = discountTotal.plus(disc);
        taxTotal = taxTotal.plus(tax);
        total = total.plus(lineTotal);

        lines.push({
          saleNoteItemId: sni.id,
          variantId: sni.variantId,
          sku: sni.sku,
          description: sni.description,
          quantity: qty,
          unitPrice: new Prisma.Decimal(sni.unitPrice),
          taxRate: new Prisma.Decimal(sni.taxRate),
          lineTotal,
          unitCostSnapshot: unitCost,
        });
      }

      const folio = await this.nextFolio(tx, organizationId, input.series);
      const number = `${input.series}-${String(folio).padStart(6, "0")}`;

      const created = await tx.creditNote.create({
        data: {
          organizationId,
          branchId: saleNote.branchId,
          orderId: saleNote.orderId,
          saleNoteId: saleNote.id,
          customerId: saleNote.customerId,
          series: input.series,
          folio,
          number,
          status: "ISSUED",
          currency: saleNote.currency,
          customerName: saleNote.customerName,
          customerTaxId: saleNote.customerTaxId,
          subtotal,
          discountTotal,
          taxTotal,
          total,
          reason: input.reason,
          refundMethod: input.refundMethod ?? null,
          refundCashSessionId: input.refundMethod === "CASH" ? input.refundCashSessionId ?? null : null,
          issuedByUserId: userId,
          correlationId,
          items: {
            create: lines.map((l) => ({
              organizationId,
              saleNoteItemId: l.saleNoteItemId,
              variantId: l.variantId,
              sku: l.sku,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
              lineTotal: l.lineTotal,
              unitCostSnapshot: l.unitCostSnapshot,
            })),
          },
        },
        include: { items: true },
      });

      // Reembolso en efectivo → sale del cajón (WITHDRAWAL) del turno indicado.
      if (input.refundMethod === "CASH" && input.refundCashSessionId && total.gt(0)) {
        await tx.cashMovement.create({
          data: {
            organizationId,
            cashSessionId: input.refundCashSessionId,
            type: "WITHDRAWAL",
            amount: total,
            reason: `Reembolso ${number}`,
            createdByUserId: userId,
          },
        });
      }

      return created;
    });

    await this.audit.record({
      action: "credit_note.issued",
      organizationId,
      entityType: "CreditNote",
      entityId: note.id,
      after: { number: note.number, saleNoteId: note.saleNoteId, total: note.total.toString() },
    });
    return note;
  }
}
