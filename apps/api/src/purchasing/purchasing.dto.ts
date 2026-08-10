import { z } from "zod";

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  notes: z.string().max(500).optional(),
  expectedDate: z.coerce.date().optional(),
  currency: z.string().length(3).default("MXN"),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        orderedQuantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().nonnegative(),
        taxRate: z.coerce.number().min(0).max(1).default(0),
      })
    )
    .min(1, "Agrega al menos un renglón"),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const createReceiptSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().nonnegative(),
        purchaseOrderItemId: z.string().uuid().optional(),
      })
    )
    .min(1, "Agrega al menos un renglón"),
});
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

export const supplierReturnSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  reasonText: z.string().min(1).max(500),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type SupplierReturnInput = z.infer<typeof supplierReturnSchema>;
