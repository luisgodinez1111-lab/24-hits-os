import { Injectable } from "@nestjs/common";
import { Prisma } from "@24hits/database";
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

  list(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.customer.findMany({ orderBy: { createdAt: "desc" }, take: 200 })
    );
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
    const customer = await this.prisma.withTenant(organizationId, (tx) =>
      tx.customer.create({
        data: {
          organizationId,
          name: input.name,
          legalName: input.legalName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          taxId: input.taxId ?? null,
          type: input.type,
          creditLimit: input.creditLimit != null ? new Prisma.Decimal(input.creditLimit) : null,
        },
      })
    );
    await this.audit.record({
      action: "customer.created",
      organizationId,
      entityType: "Customer",
      entityId: customer.id,
      after: { name: customer.name, type: customer.type },
    });
    return customer;
  }

  async update(organizationId: string, id: string, input: UpdateCustomerInput) {
    const customer = await this.prisma.withTenant(organizationId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id }, select: { id: true } });
      if (!existing) throw new AppException(404, ErrorCode.CUSTOMER_NOT_FOUND, "Cliente no encontrado");
      return tx.customer.update({
        where: { id },
        data: {
          name: input.name ?? undefined,
          legalName: input.legalName === undefined ? undefined : input.legalName,
          email: input.email === undefined ? undefined : input.email,
          phone: input.phone === undefined ? undefined : input.phone,
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
  }
}
