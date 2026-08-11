import { z } from "zod";

// Rango de fechas para los reportes. Por defecto: últimos 30 días.
export const reportRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().uuid().optional(),
});
export type ReportRangeInput = z.infer<typeof reportRangeSchema>;
