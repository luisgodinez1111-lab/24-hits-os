import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type PriceListType,
  type TenantTx,
} from "@24hits/database";
import { newId } from "@24hits/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { RequestContext } from "../common/context/request-context.js";
import { LedgerService } from "../inventory/ledger.service.js";
import { CostService } from "../inventory/cost.service.js";
import { BalanceService } from "../inventory/balance.service.js";
import { ReservationService } from "../inventory/reservation.service.js";
import type { CreateOrderInput, UpdateDeliveryInput } from "./sales.dto.js";
import { resolveLatLng } from "./geo.js";
import { haversineMatrix, optimizeSubset, osrmMatrix, osrmRoute, type Pt } from "./route-optimizer.js";

// Renglón ya calculado (precio resuelto + totales) listo para persistir.
interface ResolvedLine {
  variantId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly cost: CostService,
    private readonly balances: BalanceService,
    private readonly reservations: ReservationService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findMany({ include: { items: true }, orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  async get(organizationId: string, id: string) {
    const order = await this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findFirst({ where: { id }, include: { items: true, customer: true } })
    );
    if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
    return order;
  }

  // Actualiza la entrega del pedido (estado y/o datos de domicilio).
  // Al marcar "Entregado" (DELIVERED), el pedido se ENTREGA (fulfill): consume el
  // inventario físico y captura COGS. Si aún está en borrador, se confirma primero
  // (reserva) omitiendo el límite de crédito, porque la mercancía ya se entregó.
  async updateDelivery(organizationId: string, orderId: string, userId: string, input: UpdateDeliveryInput) {
    if (input.status === "DELIVERED") {
      const current = await this.prisma.withTenant(organizationId, (tx) =>
        tx.order.findFirst({ where: { id: orderId }, select: { status: true } })
      );
      if (!current) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (current.status === "CANCELLED") {
        throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "No se puede entregar un pedido cancelado");
      }
      let status: string = current.status;
      if (status === "DRAFT") {
        await this.confirm(organizationId, userId, orderId, { skipCreditCheck: true });
        status = "CONFIRMED";
      }
      if (status === "CONFIRMED" || status === "PARTIALLY_FULFILLED") {
        await this.fulfill(organizationId, userId, orderId);
      }
    }

    // Si cambió el link, re-extrae coordenadas (Google/Apple Maps, incluye links
    // cortos) ANTES de la transacción: puede requerir una llamada de red.
    const coords = input.deliveryLocationUrl !== undefined ? await resolveLatLng(input.deliveryLocationUrl) : undefined;

    await this.prisma.withTenant(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, select: { id: true, customerId: true } });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      await tx.order.update({
        where: { id: orderId },
        data: {
          ...(input.status !== undefined ? { deliveryStatus: input.status } : {}),
          ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
          ...(input.deliveryPhone !== undefined ? { deliveryPhone: input.deliveryPhone } : {}),
          ...(input.deliveryNotes !== undefined ? { deliveryNotes: input.deliveryNotes } : {}),
          ...(input.deliveryLocationUrl !== undefined ? { deliveryLocationUrl: input.deliveryLocationUrl } : {}),
          ...(coords !== undefined ? { deliveryLat: coords?.lat ?? null, deliveryLng: coords?.lng ?? null } : {}),
        },
      });
      if (coords && order.customerId) {
        await tx.customer.update({ where: { id: order.customerId }, data: { lat: coords.lat, lng: coords.lng } });
      }
    });
    await this.audit.record({ action: "order.delivery_updated", organizationId, entityType: "Order", entityId: orderId, after: { status: input.status } });
    return this.get(organizationId, orderId);
  }

  // Entregas pendientes (PENDING/DISPATCHED) para armar la ruta. El orden por
  // cercanía lo calcula el frontend con el GPS del repartidor (vecino más cercano).
  async pendingDeliveries(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findMany({
        where: { deliveryStatus: { in: ["PENDING", "DISPATCHED"] }, status: { not: "CANCELLED" } },
        select: {
          id: true,
          number: true,
          total: true,
          deliveryStatus: true,
          deliveryAddress: true,
          deliveryPhone: true,
          deliveryNotes: true,
          deliveryLocationUrl: true,
          deliveryLat: true,
          deliveryLng: true,
          createdAt: true,
          customer: { select: { name: true, phone: true, zone: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    );
  }

  // Ruta óptima con PRIORIDAD por tiempo: las entregas que llevan mucho esperando
  // (createdAt) se marcan prioritario/urgente y se visitan PRIMERO; dentro de cada
  // grupo se minimiza el recorrido (vecino más cercano + 2-opt), no solo el
  // siguiente salto. Distancias por carretera si hay OSRM_URL; si no, línea recta.
  async optimizeRoute(organizationId: string, start: Pt | null, osrmUrl?: string | null, osrmHeaders?: Record<string, string>) {
    const PRIORITY_MIN = 45; // min sin entregar → prioritario
    const URGENT_MIN = 90; // min sin entregar → urgente
    const now = Date.now();

    const all = await this.pendingDeliveries(organizationId);
    const coordStops = all.filter((s) => s.deliveryLat != null && s.deliveryLng != null);
    const noCoords = all.filter((s) => s.deliveryLat == null || s.deliveryLng == null);
    if (coordStops.length === 0) {
      return { provider: "none" as const, totalKm: 0, totalMin: null, priorityCount: 0, stops: [], noCoords };
    }

    // Antigüedad y nivel de prioridad por parada.
    const meta = coordStops.map((s) => {
      const minutesPending = Math.round((now - new Date(s.createdAt).getTime()) / 60000);
      const priority: "urgent" | "priority" | null = minutesPending >= URGENT_MIN ? "urgent" : minutesPending >= PRIORITY_MIN ? "priority" : null;
      return { minutesPending, priority };
    });

    const nodes: Pt[] = [];
    if (start) nodes.push(start);
    const base = start ? 1 : 0; // node index de la 1ª parada
    for (const s of coordStops) nodes.push({ lat: s.deliveryLat!, lng: s.deliveryLng! });

    const matrix = (osrmUrl ? await osrmMatrix(nodes, osrmUrl, osrmHeaders) : null) ?? haversineMatrix(nodes);
    const primary = matrix.dur ?? matrix.dist;
    const cost = (a: number, b: number) => primary[a]![b]!;

    // Índices (en espacio de nodos) de prioritarios y normales.
    const priIdx = coordStops.map((_, i) => base + i).filter((_, i) => meta[i]!.priority != null);
    const normIdx = coordStops.map((_, i) => base + i).filter((_, i) => meta[i]!.priority == null);

    // Ancla inicial: el repartidor (si hay GPS) o la 1ª parada (prioritaria si existe).
    let anchor: number;
    let anchorIsStop = false;
    if (start) {
      anchor = 0;
    } else if (priIdx.length > 0) {
      anchor = priIdx.shift()!;
      anchorIsStop = true;
    } else {
      anchor = normIdx.shift()!;
      anchorIsStop = true;
    }

    const priOrder = optimizeSubset(priIdx, anchor, cost); // prioritarios primero
    const afterPri = priOrder.length > 0 ? priOrder[priOrder.length - 1]! : anchor;
    const normOrder = optimizeSubset(normIdx, afterPri, cost); // luego el resto
    const visit = anchorIsStop ? [anchor, ...priOrder, ...normOrder] : [...priOrder, ...normOrder];

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const stops: Array<(typeof coordStops)[number] & { legKm: number | null; legMin: number | null; priority: "urgent" | "priority" | null; minutesPending: number }> = [];
    let totalKm = 0;
    let totalMin = 0;
    let prev = start ? 0 : -1; // node del punto anterior (-1 = sin origen previo)
    for (const nodeIdx of visit) {
      const stopIdx = nodeIdx - base;
      const legKm = prev < 0 ? null : matrix.dist[prev]![nodeIdx]!;
      const legMin = prev < 0 || !matrix.dur ? null : matrix.dur[prev]![nodeIdx]!;
      stops.push({
        ...coordStops[stopIdx]!,
        legKm: legKm != null ? round1(legKm) : null,
        legMin: legMin != null ? Math.round(legMin) : null,
        priority: meta[stopIdx]!.priority,
        minutesPending: meta[stopIdx]!.minutesPending,
      });
      if (legKm != null) totalKm += legKm;
      if (legMin != null) totalMin += legMin;
      prev = nodeIdx;
    }

    // Trazo por calles: geometría real de la ruta en el orden ya optimizado (solo
    // con OSRM). Sin OSRM, geometry = null y el frontend dibuja línea recta.
    let geometry: [number, number][] | null = null;
    if (matrix.provider === "osrm" && osrmUrl) {
      const orderedPts: Pt[] = [];
      if (start) orderedPts.push(nodes[0]!);
      for (const idx of visit) orderedPts.push(nodes[idx]!);
      geometry = await osrmRoute(orderedPts, osrmUrl, osrmHeaders);
    }

    return {
      provider: matrix.provider,
      totalKm: round1(totalKm),
      totalMin: matrix.dur ? Math.round(totalMin) : null,
      priorityCount: meta.filter((m) => m.priority != null).length,
      geometry,
      stops,
      noCoords,
    };
  }

  // Crea un pedido en DRAFT. Resuelve precio por renglón (override o lista de
  // precios vigente) y calcula totales en Decimal. NO toca inventario (ADR-020).
  async create(organizationId: string, userId: string, input: CreateOrderInput) {
    // Coordenadas del link ANTES de la transacción: puede requerir una llamada de
    // red (link corto de Google que se resuelve siguiendo el redirect).
    const urlCoords = await resolveLatLng(input.deliveryLocationUrl);
    const order = await this.prisma.withTenant(organizationId, async (tx) => {
      // Idempotencia: si ya existe un pedido con el mismo key, devolverlo.
      if (input.idempotencyKey) {
        const existing = await tx.order.findUnique({
          where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
          include: { items: true },
        });
        if (existing) return existing;
      }

      // Almacén: el indicado, o el fijo del usuario (operación por usuario).
      let warehouseId = input.warehouseId ?? null;
      if (!warehouseId) {
        const membership = await tx.organizationMembership.findFirst({
          where: { organizationId, userId },
          select: { defaultWarehouseId: true },
        });
        warehouseId = membership?.defaultWarehouseId ?? null;
      }
      if (!warehouseId) throw AppException.badRequest("Sin almacén: configura el almacén fijo del usuario o indícalo");
      const wh = await tx.warehouse.findFirst({ where: { id: warehouseId }, select: { branchId: true } });
      if (!wh) throw AppException.badRequest("Almacén no encontrado");

      let customerType: PriceListType = "RETAIL";
      let customerCoords: { lat: number; lng: number } | null = null;
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId },
          select: { type: true, status: true, lat: true, lng: true },
        });
        if (!customer) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");
        if (customer.status !== "ACTIVE") {
          throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "El cliente está inactivo");
        }
        customerType = customer.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
        if (customer.lat != null && customer.lng != null) customerCoords = { lat: customer.lat, lng: customer.lng };
      }

      // Coordenadas de la entrega: del link (Google/Apple Maps) o heredadas del cliente.
      const coords = urlCoords ?? customerCoords;

      // Lista de precios: explícita o la ACTIVE que corresponda al tipo de cliente.
      const priceList = input.priceListId
        ? await tx.priceList.findFirst({ where: { id: input.priceListId }, select: { id: true } })
        : await tx.priceList.findFirst({ where: { type: customerType, status: "ACTIVE" }, select: { id: true } });
      if (input.priceListId && !priceList) throw AppException.badRequest("Lista de precios no encontrada");

      const lines = await this.resolveLines(tx, priceList?.id ?? null, input);

      let subtotal = new Prisma.Decimal(0);
      let discountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      let total = new Prisma.Decimal(0);
      for (const l of lines) {
        const base = l.unitPrice.times(l.quantity);
        const net = base.minus(l.discount);
        const tax = net.times(l.taxRate);
        subtotal = subtotal.plus(base);
        discountTotal = discountTotal.plus(l.discount);
        taxTotal = taxTotal.plus(tax);
        total = total.plus(l.lineTotal);
      }

      const created = await tx.order.create({
        data: {
          organizationId,
          branchId: wh.branchId,
          warehouseId,
          customerId: input.customerId ?? null,
          number: `SO-${newId().replace(/-/g, "").slice(-12).toUpperCase()}`,
          status: "DRAFT",
          channel: input.channel ?? null,
          currency: input.currency.toUpperCase(),
          priceListId: priceList?.id ?? null,
          subtotal,
          discountTotal,
          taxTotal,
          total,
          notes: input.notes ?? null,
          deliveryAddress: input.deliveryAddress ?? null,
          deliveryPhone: input.deliveryPhone ?? null,
          deliveryNotes: input.deliveryNotes ?? null,
          deliveryLocationUrl: input.deliveryLocationUrl ?? null,
          deliveryLat: coords?.lat ?? null,
          deliveryLng: coords?.lng ?? null,
          deliveryStatus: input.deliveryAddress ? "PENDING" : null,
          createdByUserId: userId,
          correlationId: RequestContext.correlationId(),
          idempotencyKey: input.idempotencyKey ?? null,
          items: {
            create: lines.map((l) => ({
              organizationId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              taxRate: l.taxRate,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { items: true },
      });

      // Recuerda la ubicación en el cliente (si vino del link) para prellenar futuras entregas.
      if (urlCoords && input.customerId) {
        await tx.customer.update({ where: { id: input.customerId }, data: { lat: urlCoords.lat, lng: urlCoords.lng } });
      }
      return created;
    });

    await this.audit.record({
      action: "order.created",
      organizationId,
      entityType: "Order",
      entityId: order.id,
      after: { number: order.number, total: order.total.toString() },
    });
    return order;
  }

  // Resuelve precio por renglón: override explícito o precio vigente de la lista.
  private async resolveLines(
    tx: TenantTx,
    priceListId: string | null,
    input: CreateOrderInput
  ): Promise<ResolvedLine[]> {
    const now = new Date();
    const lines: ResolvedLine[] = [];
    for (const item of input.items) {
      const quantity = new Prisma.Decimal(item.quantity);

      let unitPrice: Prisma.Decimal;
      if (item.unitPrice != null) {
        unitPrice = new Prisma.Decimal(item.unitPrice);
      } else {
        if (!priceListId) {
          throw new AppException(
            422,
            ErrorCode.PRICE_NOT_FOUND,
            "No hay lista de precios y el renglón no trae precio explícito"
          );
        }
        const priceItem = await tx.priceListItem.findFirst({
          where: {
            priceListId,
            variantId: item.variantId,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
          orderBy: { validFrom: "desc" },
        });
        if (!priceItem) {
          throw new AppException(
            422,
            ErrorCode.PRICE_NOT_FOUND,
            `Sin precio vigente para la variante ${item.variantId}`
          );
        }
        unitPrice = new Prisma.Decimal(priceItem.price);
      }

      const discount = new Prisma.Decimal(item.discount);
      const taxRate = new Prisma.Decimal(item.taxRate);
      const base = unitPrice.times(quantity);
      const net = base.minus(discount);
      if (net.lt(0)) {
        throw AppException.badRequest("El descuento no puede exceder el importe del renglón");
      }
      const lineTotal = net.plus(net.times(taxRate));
      lines.push({ variantId: item.variantId, quantity, unitPrice, discount, taxRate, lineTotal });
    }
    return lines;
  }

  // Saldo comprometido del cliente: Σ pedidos comprometidos (CONFIRMED..COMPLETED) −
  // pagos − crédito a favor (notas de crédito SIN reembolso). Espeja CustomerService.
  private async customerOutstanding(tx: TenantTx, customerId: string): Promise<Prisma.Decimal> {
    const ZERO = new Prisma.Decimal(0);
    const committed = await tx.order.findMany({
      where: { customerId, status: { in: ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "COMPLETED"] } },
      select: { id: true, total: true },
    });
    const ids = committed.map((o) => o.id);
    let charges = ZERO;
    for (const o of committed) charges = charges.plus(o.total);
    const paid = ids.length
      ? new Prisma.Decimal((await tx.payment.aggregate({ where: { orderId: { in: ids }, status: "COMPLETED" }, _sum: { amount: true } }))._sum.amount ?? 0)
      : ZERO;
    const credits = await tx.creditNote.findMany({ where: { customerId, status: "ISSUED", refundMethod: null }, select: { total: true } });
    let creditInFavor = ZERO;
    for (const c of credits) creditInFavor = creditInFavor.plus(c.total);
    return charges.minus(paid).minus(creditInFavor);
  }

  // CONFIRM (ADR-021): reserva inventario por renglón vía ReservationService
  // (bloqueo FOR UPDATE, idempotente por key). Si un renglón falla, libera las
  // reservas ya creadas (compensación) y propaga el error. Baja `available`, no `onHand`.
  // Valida el límite de crédito del cliente (salvo skipCreditCheck, p.ej. POS que cobra
  // el total y no extiende crédito).
  async confirm(
    organizationId: string,
    userId: string,
    orderId: string,
    opts?: { skipCreditCheck?: boolean }
  ) {
    const order = await this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findFirst({ where: { id: orderId }, include: { items: true } })
    );
    if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
    if (order.status !== "DRAFT") {
      throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "Solo un pedido en DRAFT puede confirmarse");
    }
    if (order.items.length === 0) {
      throw new AppException(422, ErrorCode.ORDER_EMPTY, "El pedido no tiene renglones");
    }

    // Límite de crédito: proyecta saldo + total del pedido contra el límite del cliente.
    if (!opts?.skipCreditCheck && order.customerId) {
      await this.prisma.withTenant(organizationId, async (tx) => {
        const customer = await tx.customer.findFirst({ where: { id: order.customerId! }, select: { creditLimit: true } });
        if (!customer?.creditLimit) return;
        const limit = new Prisma.Decimal(customer.creditLimit);
        const balance = await this.customerOutstanding(tx, order.customerId!);
        const projected = balance.plus(order.total);
        if (projected.gt(limit)) {
          throw new AppException(
            409,
            ErrorCode.CREDIT_LIMIT_EXCEEDED,
            `El pedido excede el crédito del cliente: saldo ${balance.toString()} + ${new Prisma.Decimal(order.total).toString()} supera el límite ${limit.toString()}`
          );
        }
      });
    }

    const created: { itemId: string; reservationId: string }[] = [];
    try {
      for (const item of order.items) {
        const reservation = await this.reservations.reserve(organizationId, {
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          variantId: item.variantId,
          quantity: item.quantity.toString(),
          referenceType: "ORDER",
          referenceId: order.id,
          idempotencyKey: `order:${order.id}:item:${item.id}`,
          createdByUserId: userId,
        });
        created.push({ itemId: item.id, reservationId: reservation.id });
      }
    } catch (err) {
      // Compensación: libera lo que sí se reservó para no dejar holds huérfanos.
      for (const c of created) {
        await this.reservations.release(organizationId, c.reservationId).catch(() => undefined);
      }
      throw err;
    }

    await this.prisma.withTenant(organizationId, async (tx) => {
      for (const c of created) {
        await tx.orderItem.update({ where: { id: c.itemId }, data: { reservationId: c.reservationId } });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
    });

    await this.audit.record({
      action: "order.confirmed",
      organizationId,
      entityType: "Order",
      entityId: order.id,
    });
    return this.get(organizationId, order.id);
  }

  // FULFILL (ADR-021): por renglón con reserva activa, en UNA transacción atómica:
  // toma el costo promedio (COGS), aplica SALE (onHand -= qty, unitCost = COGS),
  // libera el hold y marca la reserva CONSUMED, reduce la base del costo promedio,
  // y guarda fulfilledQuantity + unitCostSnapshot. Estado → FULFILLED.
  async fulfill(organizationId: string, userId: string, orderId: string) {
    const correlationId = RequestContext.correlationId();
    await this.prisma.withTenant(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (order.status !== "CONFIRMED" && order.status !== "PARTIALLY_FULFILLED") {
        throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "El pedido no está confirmado");
      }

      for (const item of order.items) {
        // Ya entregado (idempotente a nivel renglón).
        if (new Prisma.Decimal(item.fulfilledQuantity).gte(item.quantity)) continue;
        if (!item.reservationId) {
          throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "Renglón sin reserva; reconfirma el pedido");
        }

        const reservation = await tx.inventoryReservation.findFirst({
          where: { id: item.reservationId, organizationId },
        });
        if (!reservation || reservation.status !== "ACTIVE") {
          throw new AppException(
            409,
            ErrorCode.INVENTORY_RESERVATION_NOT_FOUND,
            "La reserva del renglón no está activa"
          );
        }

        const qty = new Prisma.Decimal(item.quantity);

        // 1) COGS = costo promedio vigente (snapshot; no recalcula historia).
        const variantCost = await tx.variantCost.findUnique({ where: { variantId: item.variantId } });
        const averageCost = new Prisma.Decimal(variantCost?.averageCost ?? 0);

        // 2) Movimiento físico SALE (onHand -= qty) con el COGS como snapshot.
        await this.ledger.applyMovement(tx, {
          organizationId,
          branchId: order.branchId,
          warehouseId: order.warehouseId,
          variantId: item.variantId,
          movementType: "SALE",
          quantity: qty,
          unitCost: averageCost,
          totalCost: averageCost.times(qty),
          referenceType: "ORDER",
          referenceId: order.id,
          createdByUserId: userId,
          correlationId,
          idempotencyKey: `order:${order.id}:fulfill:${item.id}`,
        });

        // 3) Liberar el hold reservado y marcar la reserva CONSUMED.
        await tx.inventoryBalance.update({
          where: {
            organizationId_warehouseId_variantId: {
              organizationId,
              warehouseId: order.warehouseId,
              variantId: item.variantId,
            },
          },
          data: { reserved: { decrement: qty }, version: { increment: 1 } },
        });
        await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });

        // 4) Reducir la base de cantidad del costo promedio.
        await this.cost.reduceOnOutbound(tx, item.variantId, qty);

        // 5) Persistir COGS y cantidad entregada en el renglón.
        await tx.orderItem.update({
          where: { id: item.id },
          data: { fulfilledQuantity: qty, unitCostSnapshot: averageCost },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        // Cierre de la venta: si ya venía saldado, la entrega la deja COMPLETED.
        data: { status: order.paymentStatus === "PAID" ? "COMPLETED" : "FULFILLED", fulfilledAt: new Date() },
      });
    });

    await this.audit.record({
      action: "order.fulfilled",
      organizationId,
      entityType: "Order",
      entityId: orderId,
    });
    return this.get(organizationId, orderId);
  }

  // CANCEL (ADR-020): solo DRAFT o CONFIRMED. Si estaba CONFIRMED libera todas
  // las reservas activas (restaura `available`). No cancela pedidos ya entregados.
  async cancel(organizationId: string, orderId: string) {
    await this.prisma.withTenant(organizationId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new AppException(404, ErrorCode.ORDER_NOT_FOUND, "Pedido no encontrado");
      if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
        throw new AppException(409, ErrorCode.ORDER_INVALID_STATE, "Solo se cancela un pedido en DRAFT o CONFIRMED");
      }

      for (const item of order.items) {
        if (!item.reservationId) continue;
        const reservation = await tx.inventoryReservation.findFirst({
          where: { id: item.reservationId, organizationId },
        });
        if (!reservation || reservation.status !== "ACTIVE") continue;
        await this.balances.lockOrCreate(tx, {
          organizationId,
          branchId: reservation.branchId,
          warehouseId: reservation.warehouseId,
          variantId: reservation.variantId,
        });
        await tx.inventoryBalance.update({
          where: {
            organizationId_warehouseId_variantId: {
              organizationId,
              warehouseId: reservation.warehouseId,
              variantId: reservation.variantId,
            },
          },
          data: { reserved: { decrement: reservation.quantity }, version: { increment: 1 } },
        });
        await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    });

    await this.audit.record({
      action: "order.cancelled",
      organizationId,
      entityType: "Order",
      entityId: orderId,
    });
    return this.get(organizationId, orderId);
  }
}
