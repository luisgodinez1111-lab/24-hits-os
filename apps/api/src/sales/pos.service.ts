import { Injectable } from "@nestjs/common";
import { Prisma } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { OrderService } from "./order.service.js";
import { SaleNoteService } from "./sale-note.service.js";
import { PaymentService } from "../cash/payment.service.js";
import type { PosLookupInput, PosSaleInput } from "./pos.dto.js";

// Punto de venta: escaneo de código de barras + venta de mostrador orquestada.
// No reinventa lógica: compone OrderService + PaymentService + SaleNoteService.
@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
    private readonly saleNotes: SaleNoteService,
    private readonly audit: AuditService
  ) {}

  // Resuelve un código de barras a la variante, con su precio de lista vigente y el
  // disponible en el almacén indicado (para mostrarlo al cajero antes de agregar).
  async lookup(organizationId: string, input: PosLookupInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const bc = await tx.productBarcode.findFirst({
        where: { barcode: input.barcode },
        select: {
          variant: {
            select: { id: true, sku: true, name: true, status: true, product: { select: { name: true } } },
          },
        },
      });
      if (!bc?.variant) {
        throw new AppException(404, ErrorCode.VARIANT_NOT_FOUND, `Código no reconocido: ${input.barcode}`);
      }
      const v = bc.variant;

      // Precio: lista RETAIL activa, ítem vigente.
      const list = await tx.priceList.findFirst({ where: { type: "RETAIL", status: "ACTIVE" }, select: { id: true, currency: true } });
      let price: string | null = null;
      let currency = "MXN";
      if (list) {
        currency = list.currency;
        const now = new Date();
        const item = await tx.priceListItem.findFirst({
          where: { priceListId: list.id, variantId: v.id, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
          orderBy: { validFrom: "desc" },
          select: { price: true },
        });
        if (item) price = item.price.toString();
      }

      // Disponible en el almacén (si se indicó).
      let available: string | null = null;
      if (input.warehouseId) {
        const bal = await tx.inventoryBalance.findFirst({
          where: { warehouseId: input.warehouseId, variantId: v.id },
          select: { onHand: true, reserved: true, allocated: true, damaged: true, quarantine: true },
        });
        available = bal
          ? new Prisma.Decimal(bal.onHand).minus(bal.reserved).minus(bal.allocated).minus(bal.damaged).minus(bal.quarantine).toString()
          : "0";
      }

      return {
        variantId: v.id,
        sku: v.sku,
        name: `${v.product.name} · ${v.name}`,
        status: v.status,
        price,
        currency,
        available,
      };
    });
  }

  // Venta orquestada: crea el pedido (precio de línea explícito), reserva, entrega
  // (consume stock + captura COGS), cobra el total y emite la nota. Reutiliza los
  // servicios ya probados; el pedido termina COMPLETED (ver cierre en pagos/entrega).
  async sale(organizationId: string, userId: string, input: PosSaleInput) {
    if (input.payment.method === "CASH" && !input.payment.cashSessionId) {
      throw new AppException(422, ErrorCode.CASH_SESSION_REQUIRED, "Un cobro en efectivo requiere un turno de caja abierto");
    }

    const order = await this.orders.create(organizationId, userId, {
      warehouseId: input.warehouseId,
      customerId: input.customerId,
      channel: "POS",
      currency: input.currency,
      items: input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, taxRate: 0 })),
    });

    // El POS cobra el total en el acto → no extiende crédito, omite el límite.
    await this.orders.confirm(organizationId, userId, order.id, { skipCreditCheck: true });
    await this.orders.fulfill(organizationId, userId, order.id);

    const total = new Prisma.Decimal(order.total);
    await this.payments.record(organizationId, userId, {
      orderId: order.id,
      method: input.payment.method,
      amount: Number(total.toString()),
      cashSessionId: input.payment.cashSessionId,
      reference: input.payment.reference,
    });

    const saleNote = input.issueSaleNote
      ? await this.saleNotes.issue(organizationId, userId, { orderId: order.id, series: input.series ?? "A" })
      : null;

    await this.audit.record({
      action: "pos.sale",
      organizationId,
      entityType: "Order",
      entityId: order.id,
      after: { number: order.number, total: total.toString(), method: input.payment.method },
    });

    const finalOrder = await this.orders.get(organizationId, order.id);
    return { order: finalOrder, saleNote };
  }
}
