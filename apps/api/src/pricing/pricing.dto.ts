import { z } from "zod";

export const createPriceListSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["RETAIL", "WHOLESALE", "SPECIAL"]).default("RETAIL"),
  currency: z.string().length(3).default("MXN"),
  branchId: z.string().uuid().optional(),
  customerSegment: z.string().max(80).optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
});
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;

export const setPriceItemSchema = z
  .object({
    variantId: z.string().uuid(),
    price: z.coerce.number().nonnegative(),
    minimumPrice: z.coerce.number().nonnegative().optional(),
  })
  .refine((v) => v.minimumPrice === undefined || v.minimumPrice <= v.price, {
    message: "El precio mínimo no puede superar el precio",
    path: ["minimumPrice"],
  });
export type SetPriceItemInput = z.infer<typeof setPriceItemSchema>;

export const setVariantPriceSchema = z.object({
  price: z.coerce.number().nonnegative(),
  currency: z.string().length(3).default("MXN"),
});
export type SetVariantPriceInput = z.infer<typeof setVariantPriceSchema>;

export const initCostSchema = z.object({
  unitCost: z.coerce.number().nonnegative(),
});
export type InitCostInput = z.infer<typeof initCostSchema>;
