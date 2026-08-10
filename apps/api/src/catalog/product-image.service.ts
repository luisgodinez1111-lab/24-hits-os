import { Inject, Injectable } from "@nestjs/common";
import { newId } from "@24hits/shared";
import type { FileStorageProvider } from "@24hits/storage";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import { FILE_STORAGE } from "../storage/storage.tokens.js";
import type { ImageUploadUrlInput, RegisterImageInput } from "./product-image.dto.js";

// Imágenes de producto: el binario vive en el FileStorageProvider (MinIO/S3), no en
// PostgreSQL. Acceso privado con URLs firmadas. Claves prefijadas por organización.
@Injectable()
export class ProductImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageProvider
  ) {}

  private async assertProduct(organizationId: string, productId: string): Promise<void> {
    const p = await this.prisma.withTenant(organizationId, (tx) =>
      tx.product.findFirst({ where: { id: productId }, select: { id: true } })
    );
    if (!p) throw new AppException(404, ErrorCode.PRODUCT_NOT_FOUND, "Producto no encontrado");
  }

  // 1) El cliente pide una URL firmada de subida (PUT) y sube el binario directo al storage.
  async requestUploadUrl(organizationId: string, productId: string, input: ImageUploadUrlInput) {
    await this.assertProduct(organizationId, productId);
    const key = `org/${organizationId}/products/${productId}/${newId()}/${input.filename}`;
    const url = await this.storage.getSignedUploadUrl(key, { contentType: input.mimeType });
    return { storageKey: key, url };
  }

  // 2) Tras subir, el cliente registra la imagen con su storageKey.
  async register(organizationId: string, productId: string, userId: string, input: RegisterImageInput) {
    await this.assertProduct(organizationId, productId);
    // La clave debe pertenecer a la organización (defensa adicional).
    if (!input.storageKey.startsWith(`org/${organizationId}/`)) {
      throw AppException.badRequest("storageKey inválida para la organización");
    }
    const image = await this.prisma.withTenant(organizationId, (tx) =>
      tx.productImage.create({
        data: {
          organizationId,
          productId,
          variantId: input.variantId ?? null,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          size: input.size,
          isPrimary: input.isPrimary,
          sortOrder: input.sortOrder,
        },
      })
    );
    await this.audit.record({ action: "product.image_added", organizationId, entityType: "ProductImage", entityId: image.id });
    return image;
  }

  // Lista con URLs de descarga firmadas (de corta duración).
  async list(organizationId: string, productId: string) {
    const images = await this.prisma.withTenant(organizationId, (tx) =>
      tx.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } })
    );
    return Promise.all(
      images.map(async (img) => ({
        id: img.id,
        variantId: img.variantId,
        mimeType: img.mimeType,
        isPrimary: img.isPrimary,
        sortOrder: img.sortOrder,
        url: await this.storage.getSignedDownloadUrl(img.storageKey),
      }))
    );
  }

  async remove(organizationId: string, imageId: string): Promise<void> {
    const image = await this.prisma.withTenant(organizationId, (tx) =>
      tx.productImage.findFirst({ where: { id: imageId } })
    );
    if (!image) throw AppException.notFound("Imagen no encontrada");
    await this.storage.remove(image.storageKey).catch(() => undefined);
    await this.prisma.withTenant(organizationId, (tx) => tx.productImage.delete({ where: { id: imageId } }));
    await this.audit.record({ action: "product.image_removed", organizationId, entityType: "ProductImage", entityId: imageId });
  }
}
