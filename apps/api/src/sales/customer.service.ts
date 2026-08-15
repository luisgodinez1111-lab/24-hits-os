import { Injectable } from "@nestjs/common";
import { Prisma, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import type { CreateCustomerInput, UpdateCustomerInput } from "./sales.dto.js";

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // Lista con métricas de pedidos por cliente (nº de pedidos y última compra),
  // para el registro/CRM. Excluye pedidos cancelados del conteo.
  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const customers = await tx.customer.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
      const ids = customers.map((c) => c.id);
      const grouped = ids.length
        ? await tx.order.groupBy({
            by: ["customerId"],
            where: { customerId: { in: ids }, status: { not: "CANCELLED" } },
            _count: { _all: true },
            _max: { createdAt: true },
          })
        : [];
      const byId = new Map(grouped.map((g) => [g.customerId, g]));
      return customers.map((c) => {
        const g = byId.get(c.id);
        return { ...c, orderCount: g?._count._all ?? 0, lastOrderAt: g?._max.createdAt?.toISOString() ?? null };
      });
    });
  }

  async get(organizationId: string, id: string) {
    const customer = await this.prisma.withTenant(organizationId, (tx) =>
      tx.customer.findFirst({ where: { id } })
    );
    if (!customer) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");
    return customer;
  }

  // Estado de cuenta: comprado, pagado, devuelto y SALDO. Regla clave para no
  // doble-contar: solo las notas de crédito SIN reembolso son crédito a favor
  // (las reembolsadas ya devolvieron el dinero, no reducen la deuda).
  // Saldo = comprado − pagado − crédito a favor.
  async account(organizationId: string, customerId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId } });
      if (!customer) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");

      const orders = await tx.order.findMany({
        where: { customerId, status: { not: "CANCELLED" } },
        select: { id: true, number: true, total: true, status: true, paymentStatus: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      const orderIds = orders.map((o) => o.id);

      const paidAgg = orderIds.length
        ? await tx.payment.aggregate({ where: { orderId: { in: orderIds }, status: "COMPLETED" }, _sum: { amount: true } })
        : { _sum: { amount: null } };

      const creditNotes = await tx.creditNote.findMany({
        where: { customerId, status: "ISSUED" },
        select: { id: true, number: true, total: true, refundMethod: true, issuedAt: true, orderId: true },
        orderBy: { issuedAt: "desc" },
      });

      const ZERO = new Prisma.Decimal(0);
      let charges = ZERO;
      for (const o of orders) charges = charges.plus(o.total);
      const paid = new Prisma.Decimal(paidAgg._sum.amount ?? 0);
      let credited = ZERO;
      let creditInFavor = ZERO;
      for (const c of creditNotes) {
        credited = credited.plus(c.total);
        if (!c.refundMethod) creditInFavor = creditInFavor.plus(c.total);
      }
      const balance = charges.minus(paid).minus(creditInFavor);
      const creditLimit = customer.creditLimit ? new Prisma.Decimal(customer.creditLimit) : null;

      return {
        customer: { id: customer.id, name: customer.name, type: customer.type, status: customer.status },
        creditLimit: creditLimit?.toString() ?? null,
        creditAvailable: creditLimit ? Prisma.Decimal.max(0, creditLimit.minus(balance)).toString() : null,
        summary: {
          orderCount: orders.length,
          charges: charges.toString(),
          paid: paid.toString(),
          credited: credited.toString(),
          creditInFavor: creditInFavor.toString(),
          balance: balance.toString(),
        },
        orders: orders.slice(0, 50).map((o) => ({ id: o.id, number: o.number, total: o.total.toString(), status: o.status, paymentStatus: o.paymentStatus, date: o.createdAt.toISOString() })),
        creditNotes: creditNotes.slice(0, 50).map((c) => ({ id: c.id, number: c.number, total: c.total.toString(), refundMethod: c.refundMethod, date: c.issuedAt.toISOString() })),
      };
    });
  }

  async create(organizationId: string, input: CreateCustomerInput) {
    try {
      const customer = await this.prisma.withTenant(organizationId, async (tx) => {
        // Número de cliente: el indicado o autogenerado secuencial (C-0001).
        const code = input.code?.trim() || (await this.nextCustomerCode(tx, organizationId));
        return tx.customer.create({
          data: {
            organizationId,
            code,
            name: input.name,
            legalName: input.legalName ?? null,
            email: input.email ?? null,
            phone: input.phone ?? null,
            address: input.address ?? null,
            zone: input.zone ?? null,
            taxId: input.taxId ?? null,
            type: input.type,
            creditLimit: input.creditLimit != null ? new Prisma.Decimal(input.creditLimit) : null,
          },
        });
      });
      await this.audit.record({
        action: "customer.created",
        organizationId,
        entityType: "Customer",
        entityId: customer.id,
        after: { code: customer.code, name: customer.name, type: customer.type },
      });
      return customer;
    } catch (e) {
      throw this.mapCodeConflict(e);
    }
  }

  // Siguiente número de cliente (C-0001, C-0002…) con secuencia atómica
  // (UPDATE ... RETURNING), igual que los folios. Evita el scan O(n) y las
  // carreras: dos altas concurrentes se serializan y nunca colisionan.
  // La primera vez, siembra la secuencia con el máximo existente para no chocar
  // con clientes ya creados.
  private async nextCustomerCode(tx: TenantTx, organizationId: string): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO "DocumentSequence" ("id", "organizationId", "series", "nextValue", "updatedAt")
      VALUES (
        gen_random_uuid(), ${organizationId}::uuid, 'CUST',
        COALESCE(
          (SELECT MAX(CAST(SUBSTRING("code" FROM 3) AS INTEGER))
             FROM "Customer"
            WHERE "organizationId" = ${organizationId}::uuid AND "code" ~ '^C-[0-9]+$'),
          0
        ) + 1,
        now()
      )
      ON CONFLICT ("organizationId", "series") DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ seq: number }>>`
      UPDATE "DocumentSequence"
         SET "nextValue" = "nextValue" + 1, "updatedAt" = now()
       WHERE "organizationId" = ${organizationId}::uuid AND "series" = 'CUST'
      RETURNING ("nextValue" - 1) AS seq`;
    const seq = rows[0]?.seq;
    if (seq == null) throw new Error("No se pudo asignar número de cliente");
    return `C-${String(seq).padStart(4, "0")}`;
  }

  private mapCodeConflict(e: unknown): unknown {
    // Customer solo tiene una restricción única (organizationId, code), así que
    // cualquier P2002 aquí es un número de cliente repetido.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return new AppException(409, ErrorCode.CONFLICT, "El número de cliente ya existe");
    }
    return e;
  }

  async update(organizationId: string, id: string, input: UpdateCustomerInput) {
    try {
      const customer = await this.prisma.withTenant(organizationId, async (tx) => {
        const existing = await tx.customer.findFirst({ where: { id }, select: { id: true } });
        if (!existing) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");
        return tx.customer.update({
          where: { id },
          data: {
            code: input.code === undefined ? undefined : input.code?.trim() || null,
            name: input.name ?? undefined,
            legalName: input.legalName === undefined ? undefined : input.legalName,
            email: input.email === undefined ? undefined : input.email,
            phone: input.phone === undefined ? undefined : input.phone,
            address: input.address === undefined ? undefined : input.address,
            zone: input.zone === undefined ? undefined : input.zone,
            taxId: input.taxId === undefined ? undefined : input.taxId,
            type: input.type ?? undefined,
            creditLimit:
              input.creditLimit === undefined
                ? undefined
                : input.creditLimit === null
                  ? null
                  : new Prisma.Decimal(input.creditLimit),
            status: input.status ?? undefined,
          },
        });
      });
      await this.audit.record({
        action: "customer.updated",
        organizationId,
        entityType: "Customer",
        entityId: customer.id,
      });
      return customer;
    } catch (e) {
      throw this.mapCodeConflict(e);
    }
  }

  // Analítica del cliente para maximizar resultados: frecuencia de compra,
  // recencia, ticket, gasto total y sus sabores / modelos / marcas favoritos.
  async insights(organizationId: string, customerId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId } });
      if (!customer) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");

      const orders = await tx.order.findMany({
        where: { customerId, status: { not: "CANCELLED" } },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const orderCount = orders.length;
      const first = orderCount ? orders[0]!.createdAt : null;
      const last = orderCount ? orders[orderCount - 1]!.createdAt : null;

      const ZERO = new Prisma.Decimal(0);
      let totalSpent = ZERO;
      for (const o of orders) totalSpent = totalSpent.plus(o.total);
      const avgTicket = orderCount ? totalSpent.dividedBy(orderCount) : ZERO;

      const DAY = 86_400_000;
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const avgDaysBetween =
        orderCount >= 2 && first && last ? round1((last.getTime() - first.getTime()) / (orderCount - 1) / DAY) : null;
      const daysSinceLast = last ? round1((Date.now() - last.getTime()) / DAY) : null;

      // Preferencias por unidades efectivamente entregadas.
      const items = await tx.orderItem.findMany({
        where: { fulfilledQuantity: { gt: 0 }, order: { customerId, status: { not: "CANCELLED" } } },
        select: { variantId: true, fulfilledQuantity: true },
      });
      const variantIds = [...new Set(items.map((i) => i.variantId).filter((v): v is string => !!v))];
      const variants = variantIds.length
        ? await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: {
              id: true,
              flavor: { select: { id: true, name: true } },
              product: { select: { id: true, name: true, brand: { select: { id: true, name: true } } } },
            },
          })
        : [];
      const vById = new Map(variants.map((v) => [v.id, v]));

      const flavorAcc = new Map<string, { label: string; units: number }>();
      const modelAcc = new Map<string, { label: string; units: number }>();
      const brandAcc = new Map<string, { label: string; units: number }>();
      const bump = (m: Map<string, { label: string; units: number }>, key: string, label: string, q: number) => {
        const a = m.get(key) ?? { label, units: 0 };
        a.units += q;
        m.set(key, a);
      };
      for (const it of items) {
        const v = it.variantId ? vById.get(it.variantId) : undefined;
        const q = Number(it.fulfilledQuantity);
        bump(flavorAcc, v?.flavor?.id ?? "none", v?.flavor?.name ?? "Sin sabor", q);
        bump(modelAcc, v?.product.id ?? "none", v?.product.name ?? "—", q);
        bump(brandAcc, v?.product.brand?.id ?? "none", v?.product.brand?.name ?? "Sin marca", q);
      }
      const top = (m: Map<string, { label: string; units: number }>) =>
        [...m.values()].sort((a, b) => b.units - a.units).slice(0, 5).map((x) => ({ label: x.label, units: String(x.units) }));

      return {
        customer: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          zone: customer.zone,
          type: customer.type,
          status: customer.status,
        },
        summary: {
          orderCount,
          firstOrderAt: first?.toISOString() ?? null,
          lastOrderAt: last?.toISOString() ?? null,
          daysSinceLast,
          avgDaysBetween,
          totalSpent: totalSpent.toString(),
          avgTicket: avgTicket.toString(),
        },
        topFlavors: top(flavorAcc),
        topModels: top(modelAcc),
        topBrands: top(brandAcc),
      };
    });
  }
}
