import { Injectable } from "@nestjs/common";
import { Prisma, type TransferStatus } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { LedgerService } from "../inventory/ledger.service.js";
import { BalanceService } from "../inventory/balance.service.js";
import type {
  CreateTransferInput,
  ReceiveTransferInput,
  ShipTransferInput,
} from "./transfer.dto.js";

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly balances: BalanceService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.warehouseTransfer.findMany({
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    );
  }

  async get(organizationId: string, id: string) {
    const t = await this.prisma.withTenant(organizationId, (tx) =>
      tx.warehouseTransfer.findFirst({ where: { id }, include: { items: true } })
    );
    if (!t) throw AppException.notFound("Transferencia no encontrada");
    return t;
  }

  async create(organizationId: string, userId: string, input: CreateTransferInput) {
    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      throw new AppException(400, ErrorCode.TRANSFER_SAME_WAREHOUSE, "Origen y destino no pueden ser iguales");
    }
    const transfer = await this.prisma.withTenant(organizationId, async (tx) => {
      // Ambos almacenes deben existir en el tenant (RLS lo refuerza).
      const count = await tx.warehouse.count({
        where: { id: { in: [input.sourceWarehouseId, input.destinationWarehouseId] } },
      });
      if (count !== 2) throw AppException.badRequest("Almacén origen o destino inválido");

      return tx.warehouseTransfer.create({
        data: {
          organizationId,
          sourceWarehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          status: "DRAFT",
          notes: input.notes ?? null,
          requestedByUserId: userId,
          correlationId: RequestContext.correlationId(),
          idempotencyKey: input.idempotencyKey ?? null,
          items: {
            create: input.items.map((i) => ({
              organizationId,
              variantId: i.variantId,
              requestedQuantity: new Prisma.Decimal(i.requestedQuantity),
            })),
          },
        },
        include: { items: true },
      });
    });
    await this.audit.record({
      action: "transfer.created", organizationId, entityType: "WarehouseTransfer", entityId: transfer.id,
      after: { source: input.sourceWarehouseId, destination: input.destinationWarehouseId, items: input.items.length },
    });
    return transfer;
  }

  async request(organizationId: string, id: string) {
    return this.transition(organizationId, id, ["DRAFT"], "REQUESTED", "transfer.requested", { requestedAt: new Date() });
  }

  async approve(organizationId: string, userId: string, id: string) {
    return this.transition(organizationId, id, ["REQUESTED"], "APPROVED", "transfer.approved", {
      approvedByUserId: userId,
      approvedAt: new Date(),
    });
  }

  async cancel(organizationId: string, id: string) {
    // No se puede cancelar mercancía ya en tránsito (ADR-017).
    return this.transition(organizationId, id, ["DRAFT", "REQUESTED", "APPROVED"], "CANCELLED", "transfer.cancelled", {
      cancelledAt: new Date(),
    });
  }

  // Enviar: TRANSFER_OUT en origen (baja onHand) + tránsito (origen saliente, destino entrante).
  async ship(organizationId: string, userId: string, id: string, input: ShipTransferInput) {
    const correlationId = RequestContext.correlationId();
    const provided = new Map((input.items ?? []).map((i) => [i.itemId, new Prisma.Decimal(i.quantity)]));

    await this.prisma.withTenant(organizationId, async (tx) => {
      const transfer = await tx.warehouseTransfer.findFirst({ where: { id }, include: { items: true } });
      if (!transfer) throw AppException.notFound("Transferencia no encontrada");
      if (transfer.status !== "APPROVED") {
        throw new AppException(409, ErrorCode.TRANSFER_INVALID_STATE, "La transferencia debe estar APPROVED para enviarse");
      }

      for (const item of transfer.items) {
        const qty = provided.get(item.id) ?? new Prisma.Decimal(item.requestedQuantity);
        if (qty.lte(0)) continue;

        await this.ledger.applyMovement(tx, {
          organizationId,
          branchId: await this.branchOf(tx, transfer.sourceWarehouseId),
          warehouseId: transfer.sourceWarehouseId,
          variantId: item.variantId,
          movementType: "TRANSFER_OUT",
          quantity: qty,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          createdByUserId: userId,
          correlationId,
        });
        // Tránsito: sale del origen, entra (pendiente) al destino.
        await this.balances.bumpTransit(
          tx,
          { organizationId, branchId: await this.branchOf(tx, transfer.sourceWarehouseId), warehouseId: transfer.sourceWarehouseId, variantId: item.variantId },
          "inTransitOutgoing",
          qty
        );
        await this.balances.bumpTransit(
          tx,
          { organizationId, branchId: await this.branchOf(tx, transfer.destinationWarehouseId), warehouseId: transfer.destinationWarehouseId, variantId: item.variantId },
          "inTransitIncoming",
          qty
        );
        await tx.warehouseTransferItem.update({ where: { id: item.id }, data: { shippedQuantity: qty } });
      }

      await tx.warehouseTransfer.update({
        where: { id },
        data: { status: "IN_TRANSIT", shippedByUserId: userId, shippedAt: new Date() },
      });
    });

    await this.audit.record({ action: "transfer.shipped", organizationId, entityType: "WarehouseTransfer", entityId: id });
    return this.get(organizationId, id);
  }

  // Recibir: TRANSFER_IN en destino (sube onHand) + reduce tránsito. Soporta parcial.
  async receive(organizationId: string, userId: string, id: string, input: ReceiveTransferInput) {
    const correlationId = RequestContext.correlationId();
    const received = new Map(input.items.map((i) => [i.itemId, new Prisma.Decimal(i.quantity)]));

    await this.prisma.withTenant(organizationId, async (tx) => {
      const transfer = await tx.warehouseTransfer.findFirst({ where: { id }, include: { items: true } });
      if (!transfer) throw AppException.notFound("Transferencia no encontrada");
      if (transfer.status !== "IN_TRANSIT" && transfer.status !== "PARTIALLY_RECEIVED") {
        throw new AppException(409, ErrorCode.TRANSFER_INVALID_STATE, "La transferencia no está en tránsito");
      }

      for (const item of transfer.items) {
        const qty = received.get(item.id);
        if (!qty || qty.lte(0)) continue;
        const pending = new Prisma.Decimal(item.shippedQuantity).minus(item.receivedQuantity);
        if (qty.gt(pending)) {
          throw new AppException(409, ErrorCode.TRANSFER_INVALID_STATE, "No puedes recibir más de lo enviado pendiente");
        }

        await this.ledger.applyMovement(tx, {
          organizationId,
          branchId: await this.branchOf(tx, transfer.destinationWarehouseId),
          warehouseId: transfer.destinationWarehouseId,
          variantId: item.variantId,
          movementType: "TRANSFER_IN",
          quantity: qty,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          createdByUserId: userId,
          correlationId,
        });
        await this.balances.bumpTransit(
          tx,
          { organizationId, branchId: await this.branchOf(tx, transfer.sourceWarehouseId), warehouseId: transfer.sourceWarehouseId, variantId: item.variantId },
          "inTransitOutgoing",
          qty.negated()
        );
        await this.balances.bumpTransit(
          tx,
          { organizationId, branchId: await this.branchOf(tx, transfer.destinationWarehouseId), warehouseId: transfer.destinationWarehouseId, variantId: item.variantId },
          "inTransitIncoming",
          qty.negated()
        );
        await tx.warehouseTransferItem.update({
          where: { id: item.id },
          data: { receivedQuantity: { increment: qty } },
        });
      }

      // ¿Todo recibido? -> RECEIVED; si no -> PARTIALLY_RECEIVED (faltante = incidencia abierta).
      const fresh = await tx.warehouseTransferItem.findMany({ where: { transferId: id } });
      const complete = fresh.every((it) => new Prisma.Decimal(it.receivedQuantity).gte(it.shippedQuantity));
      await tx.warehouseTransfer.update({
        where: { id },
        data: {
          status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED",
          receivedByUserId: userId,
          receivedAt: complete ? new Date() : null,
        },
      });
    });

    await this.audit.record({ action: "transfer.received", organizationId, entityType: "WarehouseTransfer", entityId: id });
    return this.get(organizationId, id);
  }

  private async branchOf(tx: Parameters<Parameters<PrismaService["withTenant"]>[1]>[0], warehouseId: string): Promise<string> {
    const wh = await tx.warehouse.findFirst({ where: { id: warehouseId }, select: { branchId: true } });
    if (!wh) throw AppException.badRequest("Almacén no encontrado");
    return wh.branchId;
  }

  private async transition(
    organizationId: string,
    id: string,
    from: TransferStatus[],
    to: TransferStatus,
    action: string,
    extra: Record<string, unknown>
  ) {
    const updated = await this.prisma.withTenant(organizationId, async (tx) => {
      const t = await tx.warehouseTransfer.findFirst({ where: { id } });
      if (!t) throw AppException.notFound("Transferencia no encontrada");
      if (!from.includes(t.status)) {
        throw new AppException(409, ErrorCode.TRANSFER_INVALID_STATE, `Transición inválida desde ${t.status}`);
      }
      return tx.warehouseTransfer.update({ where: { id }, data: { status: to, ...extra } });
    });
    await this.audit.record({ action, organizationId, entityType: "WarehouseTransfer", entityId: id, after: { status: to } });
    return updated;
  }
}
