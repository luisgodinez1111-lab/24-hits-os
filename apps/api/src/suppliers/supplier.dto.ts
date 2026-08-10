import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(160),
  legalName: z.string().max(200).optional(),
  taxId: z.string().max(40).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  currency: z.string().length(3).default("MXN"),
  paymentTermsDays: z.coerce.number().int().nonnegative().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const setSupplierReferenceSchema = z.object({
  variantId: z.string().uuid(),
  supplierSku: z.string().max(80).optional(),
  leadTimeDays: z.coerce.number().int().nonnegative().optional(),
  isPreferred: z.boolean().default(false),
});
export type SetSupplierReferenceInput = z.infer<typeof setSupplierReferenceSchema>;
