import { z } from "zod";

export const issueSaleNoteSchema = z.object({
  orderId: z.string().uuid(),
  // Serie del folio (por defecto "A"). Cada serie lleva su consecutivo.
  series: z.string().min(1).max(10).default("A"),
  notes: z.string().max(500).optional(),
});
export type IssueSaleNoteInput = z.infer<typeof issueSaleNoteSchema>;

export const cancelSaleNoteSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelSaleNoteInput = z.infer<typeof cancelSaleNoteSchema>;
