import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type InventoryReservation,
  type MovementType,
  type TenantTx,
} from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { BalanceService } from "./balance.service.js";
import { LedgerService } from "./ledger.service.js";

export interface ReserveInput {
  branchId?: string;
  warehouseId: string;
  variantId: string;
  quantity: number | string;
  referenceType?: string | null;
  referenceId?: string | null;
  expiresAt?: Date | null;
  idempotencyKey?: string | null;
  createdByUserId: string;
}

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalanceService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService
  ) {}

  // Reserva atómica: bloquea el balance, valida disponibilidad e incrementa
  // `reserved`. Bajo concurrencia, solo uno gana la última unidad (ADR-013).
  async reserve(organizationId: string, input: ReserveInput): Promise<InventoryReservation> {
    const qty = new Prisma.Decimal(input.quantity);
    if (qty.lte(0)) {
      throw new AppException(400, ErrorCode.INVENTORY_ADJUSTMENT_INVALID, "Cantidad inválida");
    }

    const reservation = await this.prisma.withTenant(organizationId, async (tx) => {
      let branchId = input.branchId;
      if (!branchId) {
        const wh = await tx.warehouse.findFirst({
          where: { id: input.warehouseId },
          select: { branchId: true },
        });
        if (!wh) throw new AppException(404, ErrorCode.VARIANT_NOT_FOUND, "Almacén no encontrado");
        branchId = wh.branchId;
      }
      const balance = await this.balances.lockOrCreate(tx, {
        organizationId,
        branchId,
        warehouseId: input.warehouseId,
        variantId: input.variantId,
      });

      // Idempotencia (tras el lock → race-safe).
      if (input.idempotencyKey) {
        const existing = await tx.inventoryReservation.findUnique({
          where: {
            organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (existing) return existing;
      }

      const available = this.balances.available(balance);
      if (available.lt(qty)) {
        throw new AppException(
          409,
          ErrorCode.INVENTORY_INSUFFICIENT,
          "Inventario insuficiente para reservar"
        );
      }

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { reserved: { increment: qty }, version: { increment: 1 } },
      });

      return tx.inventoryReservation.create({
        data: {
          organizationId,
          branchId,
          warehouseId: input.warehouseId,
          variantId: input.variantId,
          quantity: qty,
          status: "ACTIVE",
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          expiresAt: input.expiresAt ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdByUserId: input.createdByUserId,
        },
      });
    });

    await this.audit.record({
      action: "inventory.reserved",
      organizationId,
      entityType: "InventoryReservation",
      entityId: reservation.id,
      after: { variantId: input.variantId, warehouseId: input.warehouseId, quantity: qty.toString() },
    });
    return reservation;
  }

  async release(organizationId: string, reservationId: string): Promise<void> {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const r = await tx.inventoryReservation.findFirst({
        where: { id: reservationId, organizationId },
      });
      if (!r) {
        throw new AppException(404, ErrorCode.INVENTORY_RESERVATION_NOT_FOUND, "Reserva no encontrada");
      }
      if (r.status !== "ACTIVE") {
        throw new AppException(
          409,
          ErrorCode.INVENTORY_RESERVATION_ALREADY_RELEASED,
          "La reserva no está activa"
        );
      }
      await this.releaseInTx(tx, r, "RELEASED");
    });

    await this.audit.record({
      action: "inventory.reservation_released",
      organizationId,
      entityType: "InventoryReservation",
      entityId: reservationId,
    });
  }

  // Consume una reserva: libera el hold y aplica el movimiento físico OUT.
  // El tipo lo provee el consumidor (ventas usará SALE); por defecto consumo interno.
  async consume(
    organizationId: string,
    reservationId: string,
    movementType: MovementType = "INTERNAL_CONSUMPTION"
  ): Promise<void> {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const r = await tx.inventoryReservation.findFirst({
        where: { id: reservationId, organizationId },
      });
      if (!r) {
        throw new AppException(404, ErrorCode.INVENTORY_RESERVATION_NOT_FOUND, "Reserva no encontrada");
      }
      if (r.status !== "ACTIVE") {
        throw new AppException(
          409,
          ErrorCode.INVENTORY_RESERVATION_ALREADY_RELEASED,
          "La reserva no está activa"
        );
      }

      // Movimiento físico OUT (reduce onHand) + liberar el hold reservado.
      await this.ledger.applyMovement(tx, {
        organizationId,
        branchId: r.branchId,
        warehouseId: r.warehouseId,
        variantId: r.variantId,
        movementType,
        quantity: r.quantity,
        referenceType: "RESERVATION",
        referenceId: r.id,
        createdByUserId: r.createdByUserId,
        correlationId: RequestContext.correlationId(),
      });
      await tx.inventoryBalance.update({
        where: {
          organizationId_warehouseId_variantId: {
            organizationId,
            warehouseId: r.warehouseId,
            variantId: r.variantId,
          },
        },
        data: { reserved: { decrement: r.quantity }, version: { increment: 1 } },
      });
      await tx.inventoryReservation.update({
        where: { id: r.id },
        data: { status: "CONSUMED" },
      });
    });
  }

  // Libera reservas vencidas (job del worker). Idempotente; nunca toca CONSUMED.
  async expireDue(organizationId: string, now: Date = new Date()): Promise<number> {
    const due = await this.prisma.client.inventoryReservation.findMany({
      where: { organizationId, status: "ACTIVE", expiresAt: { not: null, lt: now } },
      select: { id: true },
    });
    let released = 0;
    for (const { id } of due) {
      await this.prisma.withTenant(organizationId, async (tx) => {
        const r = await tx.inventoryReservation.findFirst({ where: { id, status: "ACTIVE" } });
        if (!r) return; // ya cambió de estado → idempotente
        await this.releaseInTx(tx, r, "EXPIRED");
        released += 1;
      });
    }
    return released;
  }

  private async releaseInTx(
    tx: TenantTx,
    reservation: InventoryReservation,
    finalStatus: "RELEASED" | "EXPIRED" | "CANCELLED"
  ): Promise<void> {
    await this.balances.lockOrCreate(tx, {
      organizationId: reservation.organizationId,
      branchId: reservation.branchId,
      warehouseId: reservation.warehouseId,
      variantId: reservation.variantId,
    });
    await tx.inventoryBalance.update({
      where: {
        organizationId_warehouseId_variantId: {
          organizationId: reservation.organizationId,
          warehouseId: reservation.warehouseId,
          variantId: reservation.variantId,
        },
      },
      data: { reserved: { decrement: reservation.quantity }, version: { increment: 1 } },
    });
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: finalStatus },
    });
  }
}
