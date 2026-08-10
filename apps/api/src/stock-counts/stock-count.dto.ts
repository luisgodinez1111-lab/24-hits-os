import { z } from "zod";

export const createStockCountSchema = z.object({
  warehouseId: z.string().uuid(),
  type: z.enum(["FULL", "CYCLE", "CATEGORY", "BRAND", "CUSTOM"]).default("CUSTOM"),
  blindCount: z.boolean().default(false),
  notes: z.string().max(500).optional(),
  variantIds: z.array(z.string().uuid()).min(1, "Agrega al menos una variante"),
});
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

export const captureCountsSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string().uuid(), countedQuantity: z.coerce.number().nonnegative() }))
    .min(1),
});
export type CaptureCountsInput = z.infer<typeof captureCountsSchema>;
