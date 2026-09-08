import { z } from "zod";

// Imágenes de producto: solo formatos rasterizados. Se excluye image/svg+xml a propósito
// (puede ejecutar script si se abre directo) y cualquier otro tipo.
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

export const imageUploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
});
export type ImageUploadUrlInput = z.infer<typeof imageUploadUrlSchema>;

export const registerImageSchema = z.object({
  storageKey: z.string().min(1).max(400),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.coerce.number().int().nonnegative().max(MAX_IMAGE_BYTES),
  variantId: z.string().uuid().optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});
export type RegisterImageInput = z.infer<typeof registerImageSchema>;
