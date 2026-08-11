import { z } from "zod";

export const issueCreditNoteSchema = z.object({
  saleNoteId: z.string().uuid(),
  series: z.string().min(1).max(10).default("NC"),
  reason: z.string().min(1).max(500),
  // Reembolso opcional. Si es CASH exige un turno de caja abierto.
  refundMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional(),
  refundCashSessionId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        saleNoteItemId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1, "Indica al menos un renglón a devolver"),
});
export type IssueCreditNoteInput = z.infer<typeof issueCreditNoteSchema>;
