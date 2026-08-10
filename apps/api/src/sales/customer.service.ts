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
