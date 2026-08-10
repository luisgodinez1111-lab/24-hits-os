import { Injectable } from "@nestjs/common";
import {
  Prisma,
  computeBalanceBuckets,
  type InventoryBalance,
  type TenantTx,
} from "@24hits/database";

export interface BalanceKey {
  organizationId: string;
  branchId: string;
  warehouseId: string;
  variantId: string;
}

export interface ComputedBuckets {
  onHand: Prisma.Decimal;
  reserved: Prisma.Decimal;
  allocated: Prisma.Decimal;
  damaged: Prisma.Decimal;
  quarantine: Prisma.Decimal;
  inTransitIncoming: Prisma.Decimal;
  inTransitOutgoing: Prisma.Decimal;
}

@Injectable()
export class BalanceService {
  // Disponible = onHand - reserved - allocated - damaged - quarantine (ADR-011).
  available(b: InventoryBalance): Prisma.Decimal {
    return new Prisma.Decimal(b.onHand)
      .minus(b.reserved)
      .minus(b.allocated)
      .minus(b.damaged)
      .minus(b.quarantine);
  }

  // Garantiza la fila de balance y la BLOQUEA (FOR UPDATE) para serializar a los
  // competidores. Núcleo del control de concurrencia (ADR-013).
  async lockOrCreate(tx: TenantTx, key: BalanceKey): Promise<InventoryBalance> {
    await tx.$executeRaw`
      INSERT INTO "InventoryBalance"
        ("id","organizationId","branchId","warehouseId","variantId","updatedAt")
      VALUES
        (gen_random_uuid(), ${key.organizationId}::uuid, ${key.branchId}::uuid,
         ${key.warehouseId}::uuid, ${key.variantId}::uuid, now())
      ON CONFLICT ("organizationId","warehouseId","variantId") DO NOTHING`;

    await tx.$queryRaw`
      SELECT 1 FROM "InventoryBalance"
      WHERE "organizationId" = ${key.organizationId}::uuid
        AND "warehouseId" = ${key.warehouseId}::uuid
        AND "variantId" = ${key.variantId}::uuid
      FOR UPDATE`;

    const balance = await tx.inventoryBalance.findUnique({
      where: {
        organizationId_warehouseId_variantId: {
          organizationId: key.organizationId,
          warehouseId: key.warehouseId,
          variantId: key.variantId,
        },
      },
    });
    if (!balance) throw new Error("No se pudo bloquear la fila de InventoryBalance");
    return balance;
  }

  // Reconstruye los buckets desde el ledger físico + subledgers (reservas/asignaciones).
  async computeFromLedger(
    tx: TenantTx,
    key: Pick<BalanceKey, "organizationId" | "warehouseId" | "variantId">
  ): Promise<ComputedBuckets> {
    // Fuente única compartida con el worker (drift): @24hits/database.
    return computeBalanceBuckets(tx, key);
  }

  // Ajusta un bucket de tránsito de un balance (bloquea/crea la fila primero).
  async bumpTransit(
    tx: TenantTx,
    key: BalanceKey,
    field: "inTransitIncoming" | "inTransitOutgoing",
    delta: Prisma.Decimal
  ): Promise<void> {
    await this.lockOrCreate(tx, key);
    await tx.inventoryBalance.update({
      where: {
        organizationId_warehouseId_variantId: {
          organizationId: key.organizationId,
          warehouseId: key.warehouseId,
          variantId: key.variantId,
        },
      },
      data: { [field]: { increment: delta }, version: { increment: 1 } },
    });
  }

  // Reescribe la proyección desde el ledger (herramienta administrativa / rebuild).
  async rebuild(tx: TenantTx, key: BalanceKey): Promise<InventoryBalance> {
    const b = await this.computeFromLedger(tx, key);
    return tx.inventoryBalance.upsert({
      where: {
        organizationId_warehouseId_variantId: {
          organizationId: key.organizationId,
          warehouseId: key.warehouseId,
          variantId: key.variantId,
        },
      },
      create: {
        organizationId: key.organizationId,
        branchId: key.branchId,
        warehouseId: key.warehouseId,
        variantId: key.variantId,
        onHand: b.onHand,
        reserved: b.reserved,
        allocated: b.allocated,
        damaged: b.damaged,
        quarantine: b.quarantine,
        inTransitIncoming: b.inTransitIncoming,
        inTransitOutgoing: b.inTransitOutgoing,
      },
      update: {
        onHand: b.onHand,
        reserved: b.reserved,
        allocated: b.allocated,
        damaged: b.damaged,
        quarantine: b.quarantine,
        inTransitIncoming: b.inTransitIncoming,
        inTransitOutgoing: b.inTransitOutgoing,
        version: { increment: 1 },
      },
    });
  }
}
