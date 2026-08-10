import { Injectable } from "@nestjs/common";
import { Prisma, type CostSourceType, type TenantTx } from "@24hits/database";

export interface InboundCostInput {
  organizationId: string;
  variantId: string;
  quantity: Prisma.Decimal | number | string;
  unitCost: Prisma.Decimal | number | string;
  sourceType: CostSourceType;
  changedByUserId?: string | null;
  correlationId?: string | null;
}

// Costo promedio móvil (ADR-014). Decimal exacto, nunca float. No recalcula la
// historia: cada cambio se registra en CostHistory con snapshot.
@Injectable()
export class CostService {
  async applyInboundCost(tx: TenantTx, input: InboundCostInput): Promise<void> {
    const inQty = new Prisma.Decimal(input.quantity);
    const inUnit = new Prisma.Decimal(input.unitCost);

    const current = await tx.variantCost.findUnique({ where: { variantId: input.variantId } });
    const prevQty = new Prisma.Decimal(current?.quantityOnHand ?? 0);
    const prevAvg = new Prisma.Decimal(current?.averageCost ?? 0);
    const newQty = prevQty.plus(inQty);

    // newAvg = (prevQty*prevAvg + inQty*inUnit) / newQty
    const newAvg = newQty.isZero()
      ? inUnit
      : prevQty.times(prevAvg).plus(inQty.times(inUnit)).dividedBy(newQty);

    await tx.variantCost.upsert({
      where: { variantId: input.variantId },
      create: {
        organizationId: input.organizationId,
        variantId: input.variantId,
        averageCost: newAvg,
        lastPurchaseCost: inUnit,
        quantityOnHand: newQty,
      },
      update: {
        averageCost: newAvg,
        lastPurchaseCost: inUnit,
        quantityOnHand: newQty,
        version: { increment: 1 },
      },
    });

    await tx.costHistory.create({
      data: {
        organizationId: input.organizationId,
        variantId: input.variantId,
        oldAverageCost: current ? prevAvg : null,
        newAverageCost: newAvg,
        quantity: inQty,
        unitCost: inUnit,
        sourceType: input.sourceType,
        changedByUserId: input.changedByUserId ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  // Fija el costo promedio directamente (inicialización o ajuste manual de costo,
  // NO derivado de una entrada de mercancía). Registra CostHistory.
  async setCost(tx: TenantTx, input: Omit<InboundCostInput, "quantity">): Promise<void> {
    const newAvg = new Prisma.Decimal(input.unitCost);
    const current = await tx.variantCost.findUnique({ where: { variantId: input.variantId } });
    await tx.variantCost.upsert({
      where: { variantId: input.variantId },
      create: {
        organizationId: input.organizationId,
        variantId: input.variantId,
        averageCost: newAvg,
        lastPurchaseCost: newAvg,
        quantityOnHand: 0,
      },
      update: { averageCost: newAvg, version: { increment: 1 } },
    });
    await tx.costHistory.create({
      data: {
        organizationId: input.organizationId,
        variantId: input.variantId,
        oldAverageCost: current ? new Prisma.Decimal(current.averageCost) : null,
        newAverageCost: newAvg,
        quantity: 0,
        unitCost: newAvg,
        sourceType: input.sourceType,
        changedByUserId: input.changedByUserId ?? null,
        correlationId: input.correlationId ?? null,
      },
    });
  }

  // Reduce la cantidad base del costo promedio al salir inventario (sin cambiar el
  // promedio; el costo aplicado a la salida se toma como snapshot por el consumidor).
  async reduceOnOutbound(
    tx: TenantTx,
    variantId: string,
    quantity: Prisma.Decimal | number | string
  ): Promise<void> {
    const current = await tx.variantCost.findUnique({ where: { variantId } });
    if (!current) return;
    const newQty = Prisma.Decimal.max(0, new Prisma.Decimal(current.quantityOnHand).minus(quantity));
    await tx.variantCost.update({
      where: { variantId },
      data: { quantityOnHand: newQty, version: { increment: 1 } },
    });
  }
}
