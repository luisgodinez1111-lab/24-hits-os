import { z } from "zod";

// Solo tipos seguros de servir (imágenes rasterizadas + PDF). Se excluyen a propósito
// text/html y image/svg+xml (pueden ejecutar script al abrirse) y cualquier ejecutable:
// así lo que se guarda en el bucket es inofensivo aunque el navegador lo abra directo.
export const ALLOWED_UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  size: z.coerce.number().int().positive().max(MAX_UPLOAD_BYTES).optional(),
});
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

export const downloadUrlSchema = z.object({
  key: z.string().min(1).max(400),
});
export type DownloadUrlInput = z.infer<typeof downloadUrlSchema>;
