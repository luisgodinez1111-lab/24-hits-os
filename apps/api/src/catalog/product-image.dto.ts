import { z } from "zod";

export const imageUploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
});
export type ImageUploadUrlInput = z.infer<typeof imageUploadUrlSchema>;

export const registerImageSchema = z.object({
  storageKey: z.string().min(1).max(400),
  mimeType: z.string().min(1).max(120),
  size: z.coerce.number().int().nonnegative(),
  variantId: z.string().uuid().optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});
export type RegisterImageInput = z.infer<typeof registerImageSchema>;
