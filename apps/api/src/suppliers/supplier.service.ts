import { Injectable } from "@nestjs/common";
import { Prisma } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type {
  BulkSetSupplierReferenceInput,
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

  // Asignación masiva de proveedor a varias variantes en una sola escritura
  // (INSERT … ON CONFLICT). Si se marca como preferido, desmarca a los demás
  // proveedores de esas variantes para garantizar un único preferido por variante
  // (que es el que toman las sugerencias de compra). Filtra a variantes del tenant.
  async bulkSetReferences(organizationId: string, supplierId: string, input: BulkSetSupplierReferenceInput) {
    await this.getById(organizationId, supplierId); // valida que el proveedor sea del tenant
    return this.prisma.withTenant(organizationId, async (tx) => {
      const variantIds = [...new Set(input.variantIds)];
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true },
      });
      const ok = variants.map((v) => v.id);
      if (ok.length === 0) return { applied: 0, skipped: input.variantIds.length };

      // Un único preferido por variante: desmarca a los demás proveedores.
      if (input.isPreferred) {
        await tx.productSupplierReference.updateMany({
          where: { variantId: { in: ok }, supplierId: { not: supplierId }, isPreferred: true },
          data: { isPreferred: false },
        });
      }

      const rows = ok.map(
        (v) =>
          Prisma.sql`(gen_random_uuid(), ${organizationId}::uuid, ${supplierId}::uuid, ${v}::uuid, ${input.isPreferred}, now(), now())`
      );
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProductSupplierReference"
          ("id", "organizationId", "supplierId", "variantId", "isPreferred", "createdAt", "updatedAt")
        VALUES ${Prisma.join(rows)}
        ON CONFLICT ("supplierId", "variantId") DO UPDATE
          SET "isPreferred" = EXCLUDED."isPreferred", "updatedAt" = now()
      `);
      return { applied: ok.length, skipped: input.variantIds.length - ok.length };
    });
  }
}
