import { Injectable } from "@nestjs/common";
import { Prisma, type PriceListType } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { RequestContext } from "../common/context/request-context.js";
import type { CreatePriceListInput, SetPriceItemInput } from "./pricing.dto.js";

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  listPriceLists(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.priceList.findMany({ orderBy: { createdAt: "desc" } })
    );
  }

  async createPriceList(organizationId: string, input: CreatePriceListInput) {
    const list = await this.prisma.withTenant(organizationId, (tx) =>
      tx.priceList.create({
        data: {
          organizationId,
          name: input.name,
          type: input.type,
          currency: input.currency.toUpperCase(),
          branchId: input.branchId ?? null,
          customerSegment: input.customerSegment ?? null,
          validFrom: input.validFrom ?? null,
          validTo: input.validTo ?? null,
        },
      })
    );
    await this.audit.record({ action: "pricelist.created", organizationId, entityType: "PriceList", entityId: list.id, after: { name: list.name, type: list.type } });
    return list;
  }

  async getPriceList(organizationId: string, id: string) {
    const list = await this.prisma.withTenant(organizationId, (tx) =>
      tx.priceList.findFirst({
        where: { id },
        include: { items: { where: { validTo: null }, orderBy: { updatedAt: "desc" } } },
      })
    );
    if (!list) throw AppException.notFound("Lista de precios no encontrada");
    return list;
  }

  // Fija el precio vigente de una variante en la lista: cierra el ítem anterior
  // (validTo=now), crea uno nuevo y registra PriceHistory + AuditEvent (price.changed).
  async setItemPrice(organizationId: string, userId: string, priceListId: string, input: SetPriceItemInput) {
    const now = new Date();
    const price = new Prisma.Decimal(input.price);
    const minimumPrice = input.minimumPrice != null ? new Prisma.Decimal(input.minimumPrice) : null;
    const correlationId = RequestContext.correlationId();

    const item = await this.prisma.withTenant(organizationId, async (tx) => {
      const list = await tx.priceList.findFirst({ where: { id: priceListId }, select: { id: true } });
      if (!list) throw AppException.notFound("Lista de precios no encontrada");

      const current = await tx.priceListItem.findFirst({
        where: { priceListId, variantId: input.variantId, validTo: null },
        orderBy: { validFrom: "desc" },
      });
      if (current) {
        await tx.priceListItem.update({ where: { id: current.id }, data: { validTo: now } });
      }
      const created = await tx.priceListItem.create({
        data: {
          organizationId,
          priceListId,
          variantId: input.variantId,
          price,
          minimumPrice,
          validFrom: now,
        },
      });
      await tx.priceHistory.create({
        data: {
          organizationId,
          variantId: input.variantId,
          priceListId,
          oldPrice: current ? new Prisma.Decimal(current.price) : null,
          newPrice: price,
          changedByUserId: userId,
          correlationId,
        },
      });
      return created;
    });

    await this.audit.record({
      action: "price.changed", organizationId, entityType: "PriceListItem", entityId: item.id,
      after: { variantId: input.variantId, price: price.toString() },
    });
    return item;
  }

  priceHistory(organizationId: string, variantId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.priceHistory.findMany({ where: { variantId }, orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  // Precio vigente de una variante para un tipo de lista (por defecto RETAIL).
  async currentPrice(organizationId: string, variantId: string, type: PriceListType = "RETAIL") {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const list = await tx.priceList.findFirst({ where: { type, status: "ACTIVE" }, select: { id: true, currency: true } });
      if (!list) return null;
      const now = new Date();
      const item = await tx.priceListItem.findFirst({
        where: {
          priceListId: list.id,
          variantId,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
        orderBy: { validFrom: "desc" },
      });
      return item ? { price: item.price.toString(), minimumPrice: item.minimumPrice?.toString() ?? null, currency: list.currency } : null;
    });
  }
}
