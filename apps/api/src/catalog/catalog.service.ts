import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import {
  createBrandSchema,
  createCategorySchema,
  createFlavorSchema,
  createUnitSchema,
} from "./catalog.dto.js";
import { normalize, slugify } from "./slug.js";

type CreateBrand = z.infer<typeof createBrandSchema>;
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
