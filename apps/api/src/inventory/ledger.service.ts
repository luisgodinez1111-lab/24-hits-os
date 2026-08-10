import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type InventoryMovement,
  type MovementType,
  type ReasonCode,
  type TenantTx,
} from "@24hits/database";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { BalanceService } from "./balance.service.js";
import { MOVEMENT_EFFECTS } from "./inventory.effects.js";

export interface ApplyMovementInput {
  organizationId: string;
  branchId: string;
  warehouseId: string;
  variantId: string;
  movementType: MovementType;
  quantity: Prisma.Decimal | number | string;
  unitCost?: Prisma.Decimal | number | string | null;
  totalCost?: Prisma.Decimal | number | string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reasonCode?: ReasonCode | null;
  reasonText?: string | null;
  createdByUserId: string;
  approvedByUserId?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Prisma.InputJsonValue;
  allowBackorder?: boolean;
}

export interface ApplyMovementResult {
  movement: InventoryMovement;
  idempotentReplay: boolean;
}

function directionOf(type: MovementType): "IN" | "OUT" | "NEUTRAL" {
  const e = MOVEMENT_EFFECTS[type];
  if (e.onHand > 0) return "IN";
  if (e.onHand < 0) return "OUT";
  return "NEUTRAL";
}

@Injectable()
export class LedgerService {
  constructor(private readonly balances: BalanceService) {}

  // Operación física atómica: bloquea el balance, valida la invariante (ningún
  // bucket puede quedar negativo), actualiza la proyección e inserta el movimiento
  // inmutable. Debe ejecutarse SIEMPRE dentro de withTenant (transacción + RLS).
  async applyMovement(tx: TenantTx, input: ApplyMovementInput): Promise<ApplyMovementResult> {
    const qty = new Prisma.Decimal(input.quantity);
    if (qty.lte(0)) {
      throw new AppException(400, ErrorCode.INVENTORY_ADJUSTMENT_INVALID, "La cantidad debe ser mayor que cero");
    }

    // 1. Bloqueo pesimista de la fila (serializa concurrencia).
    const balance = await this.balances.lockOrCreate(tx, {
      organizationId: input.organizationId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      variantId: input.variantId,
    });

    // 2. Idempotencia: si ya se aplicó este key, no duplicar.
    if (input.idempotencyKey) {
      const existing = await tx.inventoryMovement.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return { movement: existing, idempotentReplay: true };
    }

    // 3. Calcular nuevos buckets con el mapa de efectos.
    const e = MOVEMENT_EFFECTS[input.movementType];
    const next = {
      onHand: new Prisma.Decimal(balance.onHand).plus(qty.times(e.onHand)),
      damaged: new Prisma.Decimal(balance.damaged).plus(qty.times(e.damaged)),
      quarantine: new Prisma.Decimal(balance.quarantine).plus(qty.times(e.quarantine)),
      inTransitIncoming: new Prisma.Decimal(balance.inTransitIncoming).plus(qty.times(e.inTransitIncoming)),
      inTransitOutgoing: new Prisma.Decimal(balance.inTransitOutgoing).plus(qty.times(e.inTransitOutgoing)),
    };

    // 4. Validar invariante: ningún bucket negativo (salvo backorder explícito en onHand).
    if (next.onHand.lt(0) && !input.allowBackorder) {
      throw new AppException(
        409,
        ErrorCode.INVENTORY_INSUFFICIENT,
        "Inventario insuficiente para la operación"
      );
    }
    if (next.damaged.lt(0) || next.quarantine.lt(0) || next.inTransitIncoming.lt(0) || next.inTransitOutgoing.lt(0)) {
      throw new AppException(
        409,
        ErrorCode.INVENTORY_ADJUSTMENT_INVALID,
        "La operación dejaría un bucket de inventario en negativo"
      );
    }

    // 5. Actualizar proyección (misma transacción).
    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { ...next, version: { increment: 1 } },
    });

    // 6. Insertar el movimiento inmutable.
    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        movementType: input.movementType,
        direction: directionOf(input.movementType),
        quantity: qty,
        unitCost: input.unitCost ?? null,
        totalCost: input.totalCost ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        reasonCode: input.reasonCode ?? null,
        reasonText: input.reasonText ?? null,
        createdByUserId: input.createdByUserId,
        approvedByUserId: input.approvedByUserId ?? null,
        correlationId: input.correlationId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata,
      },
    });

    return { movement, idempotentReplay: false };
  }
}
