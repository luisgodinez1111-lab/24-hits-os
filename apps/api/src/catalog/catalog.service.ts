import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import {
  createBrandSchema,
  createCategorySchema,
  createFlavorSchema,
  createUnitSchema,
  updateBrandSchema,
} from "./catalog.dto.js";
import { normalize, slugify } from "./slug.js";

type CreateBrand = z.infer<typeof createBrandSchema>;
type UpdateBrand = z.infer<typeof updateBrandSchema>;
type CreateCategory = z.infer<typeof createCategorySchema>;
type CreateFlavor = z.infer<typeof createFlavorSchema>;
type CreateUnit = z.infer<typeof createUnitSchema>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // --- Brands ---
  listBrands(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.brand.findMany({ orderBy: { name: "asc" } })
    );
  }
  async createBrand(organizationId: string, input: CreateBrand) {
    const brand = await this.prisma.withTenant(organizationId, (tx) =>
      tx.brand.create({
        data: { organizationId, name: input.name, slug: input.slug ? slugify(input.slug) : slugify(input.name) },
      })
    );
    await this.audit.record({ action: "brand.created", organizationId, entityType: "Brand", entityId: brand.id, after: { name: brand.name } });
    return brand;
  }

  // Editar marca: renombrar y/o dar de baja/reactivar. "Dar de baja" = status INACTIVE
  // (borrado lógico): la marca deja de ofrecerse pero sus modelos y su historial de
  // ventas se conservan intactos. Es reversible (reactivar).
  async updateBrand(organizationId: string, brandId: string, input: UpdateBrand) {
    const before = await this.prisma.withTenant(organizationId, (tx) =>
      tx.brand.findFirst({ where: { id: brandId }, select: { id: true, name: true, status: true } })
    );
    if (!before) throw new AppException(404, ErrorCode.NOT_FOUND, "Marca no encontrada");

    const brand = await this.prisma.withTenant(organizationId, (tx) =>
      tx.brand.update({
        where: { id: brandId },
        data: {
          ...(input.name ? { name: input.name, slug: slugify(input.name) } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      })
    );
    await this.audit.record({
      action: input.status && input.status !== before.status ? `brand.${input.status === "INACTIVE" ? "deactivated" : "reactivated"}` : "brand.updated",
      organizationId, entityType: "Brand", entityId: brandId,
      before: { name: before.name, status: before.status },
      after: { name: brand.name, status: brand.status },
    });
    return brand;
  }

  // Elimina una marca. Es seguro: los modelos con esta marca quedan "sin marca"
  // (Product.brandId → null por onDelete: SetNull), no se borran. Devuelve cuántos
  // modelos se desvincularon.
  async deleteBrand(organizationId: string, brandId: string) {
    const brand = await this.prisma.withTenant(organizationId, (tx) =>
      tx.brand.findFirst({ where: { id: brandId }, select: { id: true, name: true, _count: { select: { products: true } } } })
    );
    if (!brand) throw new AppException(404, ErrorCode.NOT_FOUND, "Marca no encontrada");
    await this.prisma.withTenant(organizationId, (tx) => tx.brand.delete({ where: { id: brandId } }));
    await this.audit.record({
      action: "brand.deleted", organizationId, entityType: "Brand", entityId: brandId,
      before: { name: brand.name, models: brand._count.products },
    });
    return { deleted: true, unlinkedModels: brand._count.products };
  }

  // --- Categories ---
  listCategories(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.category.findMany({ orderBy: { name: "asc" } })
    );
  }
  async createCategory(organizationId: string, input: CreateCategory) {
    const category = await this.prisma.withTenant(organizationId, (tx) =>
      tx.category.create({
        data: {
          organizationId,
          name: input.name,
          slug: input.slug ? slugify(input.slug) : slugify(input.name),
          parentCategoryId: input.parentCategoryId ?? null,
        },
      })
    );
    await this.audit.record({ action: "category.created", organizationId, entityType: "Category", entityId: category.id, after: { name: category.name } });
    return category;
  }

  // --- Flavors ---
  listFlavors(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.flavor.findMany({ orderBy: { name: "asc" } })
    );
  }
  async createFlavor(organizationId: string, input: CreateFlavor) {
    const flavor = await this.prisma.withTenant(organizationId, (tx) =>
      tx.flavor.create({ data: { organizationId, name: input.name, normalizedName: normalize(input.name) } })
    );
    await this.audit.record({ action: "flavor.created", organizationId, entityType: "Flavor", entityId: flavor.id, after: { name: flavor.name } });
    return flavor;
  }

  // --- Units ---
  listUnits(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.unitOfMeasure.findMany({ orderBy: { code: "asc" } })
    );
  }
  createUnit(organizationId: string, input: CreateUnit) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.unitOfMeasure.create({ data: { organizationId, code: input.code.toUpperCase(), name: input.name } })
    );
  }
}
