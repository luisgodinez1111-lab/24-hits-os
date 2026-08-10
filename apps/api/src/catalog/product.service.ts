import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import {
  addBarcodeSchema,
  createProductSchema,
  createVariantSchema,
  updateProductSchema,
  type ProductSearch,
} from "./catalog.dto.js";
import { slugify } from "./slug.js";

type CreateProduct = z.infer<typeof createProductSchema>;
type UpdateProduct = z.infer<typeof updateProductSchema>;
type CreateVariant = z.infer<typeof createVariantSchema>;
type AddBarcode = z.infer<typeof addBarcodeSchema>;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // Búsqueda tenant-scoped, paginada por cursor. No carga todo el catálogo.
  search(organizationId: string, q: ProductSearch) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const items = await tx.product.findMany({
        where: {
          ...(q.brandId ? { brandId: q.brandId } : {}),
          ...(q.categoryId ? { categoryId: q.categoryId } : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(q.search
            ? {
                OR: [
                  { name: { contains: q.search, mode: "insensitive" } },
                  { variants: { some: { sku: { contains: q.search, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        select: {
          id: true, name: true, slug: true, status: true, updatedAt: true,
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > q.limit;
      const page = hasMore ? items.slice(0, q.limit) : items;
      return { items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
    });
  }

  async getById(organizationId: string, id: string) {
    const product = await this.prisma.withTenant(organizationId, (tx) =>
      tx.product.findFirst({
        where: { id },
        include: {
          brand: true,
          category: true,
          variants: { include: { flavor: true, barcodes: true } },
        },
      })
    );
    if (!product) throw new AppException(404, ErrorCode.PRODUCT_NOT_FOUND, "Producto no encontrado");
    return product;
  }

  async createProduct(organizationId: string, input: CreateProduct) {
    const product = await this.prisma.withTenant(organizationId, (tx) =>
      tx.product.create({
        data: {
          organizationId,
          name: input.name,
          slug: input.slug ? slugify(input.slug) : slugify(input.name),
          brandId: input.brandId ?? null,
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          status: input.status ?? "DRAFT",
        },
      })
    );
    await this.audit.record({ action: "product.created", organizationId, entityType: "Product", entityId: product.id, after: { name: product.name } });
    return product;
  }

  async updateProduct(organizationId: string, id: string, input: UpdateProduct) {
    const before = await this.prisma.withTenant(organizationId, (tx) => tx.product.findFirst({ where: { id } }));
    if (!before) throw new AppException(404, ErrorCode.PRODUCT_NOT_FOUND, "Producto no encontrado");
    const after = await this.prisma.withTenant(organizationId, (tx) =>
      tx.product.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name, slug: input.slug ? slugify(input.slug) : slugify(input.name) } : {}),
          ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      })
    );
    await this.audit.record({
      action: "product.updated", organizationId, entityType: "Product", entityId: id,
      before: { name: before.name, status: before.status },
      after: { name: after.name, status: after.status },
    });
    return after;
  }

  async createVariant(organizationId: string, productId: string, input: CreateVariant) {
    const product = await this.prisma.withTenant(organizationId, (tx) => tx.product.findFirst({ where: { id: productId }, select: { id: true } }));
    if (!product) throw new AppException(404, ErrorCode.PRODUCT_NOT_FOUND, "Producto no encontrado");

    try {
      const variant = await this.prisma.withTenant(organizationId, async (tx) => {
        const v = await tx.productVariant.create({
          data: {
            organizationId,
            productId,
            flavorId: input.flavorId ?? null,
            sku: input.sku,
            name: input.name,
            purchaseUnitId: input.purchaseUnitId,
            salesUnitId: input.salesUnitId,
            unitsPerPurchaseUnit: input.unitsPerPurchaseUnit,
            trackInventory: input.trackInventory,
            allowBackorder: input.allowBackorder,
          },
        });
        if (input.barcode) {
          await tx.productBarcode.create({
            data: {
              organizationId,
              variantId: v.id,
              barcode: input.barcode,
              type: input.barcodeType ?? "OTHER",
              isPrimary: true,
            },
          });
        }
        return v;
      });
      await this.audit.record({ action: "variant.created", organizationId, entityType: "ProductVariant", entityId: variant.id, after: { sku: variant.sku } });
      return variant;
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  async addBarcode(organizationId: string, variantId: string, input: AddBarcode) {
    const variant = await this.prisma.withTenant(organizationId, (tx) => tx.productVariant.findFirst({ where: { id: variantId }, select: { id: true } }));
    if (!variant) throw new AppException(404, ErrorCode.VARIANT_NOT_FOUND, "Variante no encontrada");
    try {
      return await this.prisma.withTenant(organizationId, (tx) =>
        tx.productBarcode.create({
          data: { organizationId, variantId, barcode: input.barcode, type: input.type, isPrimary: input.isPrimary },
        })
      );
    } catch (e) {
      throw this.mapUniqueError(e);
    }
  }

  listVariants(organizationId: string, search?: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.productVariant.findMany({
        where: search
          ? {
              OR: [
                { sku: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { barcodes: { some: { barcode: { contains: search } } } },
              ],
            }
          : {},
        include: { flavor: { select: { name: true } }, product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    );
  }

  private mapUniqueError(e: unknown): AppException {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(",") ?? "";
      if (target.includes("sku")) return new AppException(409, ErrorCode.SKU_ALREADY_EXISTS, "El SKU ya existe en la organización");
      if (target.includes("barcode")) return new AppException(409, ErrorCode.BARCODE_ALREADY_EXISTS, "El código de barras ya existe");
    }
    return e instanceof AppException ? e : new AppException(409, ErrorCode.CONFLICT, "Conflicto de unicidad");
  }
}
