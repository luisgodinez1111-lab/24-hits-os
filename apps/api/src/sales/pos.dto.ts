import { z } from "zod";

// Lookup por código de barras (query params).
export const posLookupSchema = z.object({
  barcode: z.string().min(1).max(64),
  warehouseId: z.string().uuid().optional(),
});
export type PosLookupInput = z.infer<typeof posLookupSchema>;

// Venta de mostrador orquestada: crear → confirmar → entregar → cobrar → nota.
export const posSaleSchema = z.object({
  warehouseId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  currency: z.string().length(3).default("MXN"),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative().optional(),
        discount: z.coerce.number().nonnegative().default(0),
      })
    )
    .min(1, "Agrega al menos un producto"),
  payment: z.object({
    method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
    cashSessionId: z.string().uuid().optional(),
    reference: z.string().max(120).optional(),
  }),
  issueSaleNote: z.coerce.boolean().default(true),
  series: z.string().min(1).max(10).optional(),
});
export type PosSaleInput = z.infer<typeof posSaleSchema>;
