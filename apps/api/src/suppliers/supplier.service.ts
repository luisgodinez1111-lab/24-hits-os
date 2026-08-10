import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type {
  CreateSupplierInput,
  SetSupplierReferenceInput,
  UpdateSupplierInput,
} from "./supplier.dto.js";

@Injectable()
export class SupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string, filters: { search?: string; status?: "ACTIVE" | "INACTIVE" }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.supplier.findMany({
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.search
            ? {
                OR: [
                  { name: { contains: filters.search, mode: "insensitive" } },
                  { taxId: { contains: filters.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        take: 200,
      })
    );
  }

  async getById(organizationId: string, id: string) {
    const s = await this.prisma.withTenant(organizationId, (tx) =>
      tx.supplier.findFirst({ where: { id }, include: { references: true } })
    );
    if (!s) throw AppException.notFound("Proveedor no encontrado");
    return s;
  }

  async create(organizationId: string, input: CreateSupplierInput) {
    const supplier = await this.prisma.withTenant(organizationId, (tx) =>
      tx.supplier.create({
        data: {
          organizationId,
          name: input.name,
          legalName: input.legalName ?? null,
          taxId: input.taxId ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          currency: input.currency.toUpperCase(),
          paymentTermsDays: input.paymentTermsDays ?? null,
        },
      })
    );
    await this.audit.record({ action: "supplier.created", organizationId, entityType: "Supplier", entityId: supplier.id, after: { name: supplier.name } });
    return supplier;
  }

  async update(organizationId: string, id: string, input: UpdateSupplierInput) {
    const before = await this.prisma.withTenant(organizationId, (tx) => tx.supplier.findFirst({ where: { id } }));
    if (!before) throw AppException.notFound("Proveedor no encontrado");
    const supplier = await this.prisma.withTenant(organizationId, (tx) =>
      tx.supplier.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
          ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
          ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      })
    );
    await this.audit.record({ action: "supplier.updated", organizationId, entityType: "Supplier", entityId: id, before: { name: before.name, status: before.status }, after: { name: supplier.name, status: supplier.status } });
    return supplier;
  }

  // Relación proveedor↔variante (SKU del proveedor, lead time, preferido).
  async setReference(organizationId: string, supplierId: string, input: SetSupplierReferenceInput) {
    await this.getById(organizationId, supplierId);
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.productSupplierReference.upsert({
        where: { supplierId_variantId: { supplierId, variantId: input.variantId } },
        update: {
          supplierSku: input.supplierSku ?? null,
          leadTimeDays: input.leadTimeDays ?? null,
          isPreferred: input.isPreferred,
        },
        create: {
          organizationId,
          supplierId,
          variantId: input.variantId,
          supplierSku: input.supplierSku ?? null,
          leadTimeDays: input.leadTimeDays ?? null,
          isPreferred: input.isPreferred,
        },
      })
    );
  }
}
