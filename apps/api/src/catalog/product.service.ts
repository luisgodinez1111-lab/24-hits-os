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
  quickRegisterSchema,
  updateProductSchema,
  type ProductSearch,
} from "./catalog.dto.js";
import { normalize, slugify } from "./slug.js";

type CreateProduct = z.infer<typeof createProductSchema>;
type UpdateProduct = z.infer<typeof updateProductSchema>;
type CreateVariant = z.infer<typeof createVariantSchema>;
type AddBarcode = z.infer<typeof addBarcodeSchema>;
type QuickRegister = z.infer<typeof quickRegisterSchema>;

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
    return this.prisma.withTenant(organizationId, async (tx) => {
      const product = await tx.product.findFirst({
        where: { id },
        include: {
          brand: true,
          category: true,
          variants: { include: { flavor: true, barcodes: true } },
        },
      });
      if (!product) throw new AppException(404, ErrorCode.PRODUCT_NOT_FOUND, "Producto no encontrado");

      // Precio de venta vigente (RETAIL) por sabor, para mostrarlo/editarlo aquí.
      const variantIds = product.variants.map((v) => v.id);
      const list = variantIds.length
        ? await tx.priceList.findFirst({ where: { type: "RETAIL", status: "ACTIVE" }, select: { id: true } })
        : null;
      const items = list
        ? await tx.priceListItem.findMany({
            where: { priceListId: list.id, variantId: { in: variantIds }, validTo: null },
            orderBy: { validFrom: "asc" },
            select: { variantId: true, price: true },
          })
        : [];
      const priceMap = new Map(items.map((i) => [i.variantId, i.price.toString()]));

      return {
        ...product,
        variants: product.variants.map((v) => ({ ...v, price: priceMap.get(v.id) ?? null })),
      };
    });
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

  // SKU legible autogenerado: abreviatura del modelo + sabor + sufijo aleatorio
  // corto (para que sea único sin pedírselo al usuario).
  private generateSku(productName: string, label: string): string {
    const abbr = (s: string) => slugify(s).replace(/-/g, "").slice(0, 6).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const base = [abbr(productName), abbr(label)].filter(Boolean).join("-");
    return base ? `${base}-${rand}` : `SKU-${rand}`;
  }

  // Alta de un sabor (variante). Diseño fácil: con el nombre del sabor basta.
  // SKU y unidad "Pieza" se autogeneran; precio y código de barras son opcionales.
  async createVariant(organizationId: string, productId: string, input: CreateVariant) {
    const product = await this.prisma.withTenant(organizationId, (tx) => tx.product.findFirst({ where: { id: productId }, select: { id: true, name: true } }));
    if (!product) throw new AppException(404, ErrorCode.PRODUCT_NOT_FOUND, "Producto no encontrado");

    try {
      const variant = await this.prisma.withTenant(organizationId, async (tx) => {
        // Sabor: por id, o por nombre (se reutiliza/crea por nombre normalizado).
        let flavorId = input.flavorId ?? null;
        let flavorLabel: string | null = null;
        if (!flavorId && input.flavorName?.trim()) {
          const normalizedName = normalize(input.flavorName);
          const flavor =
            (await tx.flavor.findFirst({ where: { normalizedName }, select: { id: true, name: true } })) ??
            (await tx.flavor.create({ data: { organizationId, name: input.flavorName.trim(), normalizedName }, select: { id: true, name: true } }));
          flavorId = flavor.id;
          flavorLabel = flavor.name;
        } else if (flavorId) {
          flavorLabel = (await tx.flavor.findFirst({ where: { id: flavorId }, select: { name: true } }))?.name ?? null;
        }

        // Unidad: la indicada o la de "Pieza" por defecto (se crea si no existe).
        let purchaseUnitId = input.purchaseUnitId ?? null;
        let salesUnitId = input.salesUnitId ?? null;
        if (!purchaseUnitId || !salesUnitId) {
          const unit =
            (await tx.unitOfMeasure.findFirst({ where: {}, select: { id: true }, orderBy: { createdAt: "asc" } })) ??
            (await tx.unitOfMeasure.create({ data: { organizationId, code: "PZ", name: "Pieza" }, select: { id: true } }));
          purchaseUnitId = purchaseUnitId ?? unit.id;
          salesUnitId = salesUnitId ?? unit.id;
        }

        const name = input.name?.trim() || flavorLabel || "Estándar";
        const sku = input.sku?.trim() || this.generateSku(product.name, flavorLabel ?? name);

        const v = await tx.productVariant.create({
          data: {
            organizationId,
            productId,
            flavorId,
            sku,
            name,
            purchaseUnitId,
            salesUnitId,
            unitsPerPurchaseUnit: input.unitsPerPurchaseUnit,
            trackInventory: input.trackInventory,
            allowBackorder: input.allowBackorder,
          },
        });
        if (input.barcode) {
          await tx.productBarcode.create({
            data: { organizationId, variantId: v.id, barcode: input.barcode, type: input.barcodeType ?? "OTHER", isPrimary: true },
          });
        }
        // Precio (opcional): lista RETAIL activa (reutiliza o crea) + ítem vigente.
        if (input.price != null) {
          const list =
            (await tx.priceList.findFirst({ where: { type: "RETAIL", status: "ACTIVE" }, select: { id: true } })) ??
            (await tx.priceList.create({
              data: { organizationId, name: "Lista de precios", type: "RETAIL", status: "ACTIVE", currency: input.currency },
              select: { id: true },
            }));
          await tx.priceListItem.create({
            data: { organizationId, priceListId: list.id, variantId: v.id, price: new Prisma.Decimal(input.price) },
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

  // Alta rápida por escaneo: crea modelo (producto) + sabor (variante) + código
  // de barras + precio, todo en una transacción tenant-scoped. Marca y sabor se
  // resuelven por nombre (se reutilizan si existen, se crean si no). Devuelve la
  // misma forma que el lookup del POS para poder agregar al carrito de inmediato.
  async quickRegister(organizationId: string, input: QuickRegister) {
    try {
      const result = await this.prisma.withTenant(organizationId, async (tx) => {
        // El código no debe existir todavía (el flujo se dispara tras un lookup 404).
        const existing = await tx.productBarcode.findFirst({ where: { barcode: input.barcode }, select: { id: true } });
        if (existing) throw new AppException(409, ErrorCode.BARCODE_ALREADY_EXISTS, "El código de barras ya existe");

        // Marca (opcional): reutiliza por slug o crea.
        let brandId: string | null = null;
        if (input.brandName?.trim()) {
          const slug = slugify(input.brandName);
          const brand =
            (await tx.brand.findFirst({ where: { slug }, select: { id: true } })) ??
            (await tx.brand.create({ data: { organizationId, name: input.brandName.trim(), slug }, select: { id: true } }));
          brandId = brand.id;
        }

        // Modelo (producto): reutiliza por nombre+marca o crea ACTIVE.
        const productName = input.productName.trim();
        const product =
          (await tx.product.findFirst({ where: { name: productName, brandId }, select: { id: true, name: true } })) ??
          (await tx.product.create({
            data: { organizationId, name: productName, slug: slugify(productName), brandId, status: "ACTIVE" },
            select: { id: true, name: true },
          }));

        // Sabor (opcional): reutiliza por nombre normalizado o crea.
        let flavorId: string | null = null;
        if (input.flavorName?.trim()) {
          const normalizedName = normalize(input.flavorName);
          const flavor =
            (await tx.flavor.findFirst({ where: { normalizedName }, select: { id: true } })) ??
            (await tx.flavor.create({ data: { organizationId, name: input.flavorName.trim(), normalizedName }, select: { id: true } }));
          flavorId = flavor.id;
        }

        // Unidad por defecto (las variantes la requieren): usa "PZ" o crea una.
        const unit =
          (await tx.unitOfMeasure.findFirst({ where: {}, select: { id: true }, orderBy: { createdAt: "asc" } })) ??
          (await tx.unitOfMeasure.create({ data: { organizationId, code: "PZ", name: "Pieza" }, select: { id: true } }));

        // SKU: usa el indicado o deriva del código de barras (único por org).
        const sku = input.sku?.trim() || input.barcode;

        const variant = await tx.productVariant.create({
          data: {
            organizationId,
            productId: product.id,
            flavorId,
            sku,
            name: input.flavorName?.trim() || productName,
            purchaseUnitId: unit.id,
            salesUnitId: unit.id,
            status: "ACTIVE",
          },
          select: { id: true, sku: true, name: true, status: true },
        });

        await tx.productBarcode.create({
          data: { organizationId, variantId: variant.id, barcode: input.barcode, type: input.barcodeType, isPrimary: true },
        });

        // Precio (opcional): lista RETAIL activa (reutiliza o crea) + ítem vigente.
        let price: string | null = null;
        if (input.price != null) {
          const list =
            (await tx.priceList.findFirst({ where: { type: "RETAIL", status: "ACTIVE" }, select: { id: true } })) ??
            (await tx.priceList.create({
              data: { organizationId, name: "Lista de precios", type: "RETAIL", status: "ACTIVE", currency: input.currency },
              select: { id: true },
            }));
          const item = await tx.priceListItem.create({
            data: { organizationId, priceListId: list.id, variantId: variant.id, price: new Prisma.Decimal(input.price) },
            select: { price: true },
          });
          price = item.price.toString();
        }

        return {
          productId: product.id,
          variantId: variant.id,
          sku: variant.sku,
          name: `${product.name} · ${variant.name}`,
          status: variant.status,
          price,
          currency: input.currency,
          available: null as string | null,
        };
      });
      await this.audit.record({
        action: "product.quick_registered", organizationId, entityType: "ProductVariant", entityId: result.variantId,
        after: { sku: result.sku, barcode: input.barcode },
      });
      return result;
    } catch (e) {
      throw this.mapUniqueError(e);
    }
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
