import { z } from "zod";

export const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150).optional(),
});
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

export const downloadUrlSchema = z.object({
  key: z.string().min(1).max(400),
});
export type DownloadUrlInput = z.infer<typeof downloadUrlSchema>;
