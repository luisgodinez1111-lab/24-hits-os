import { z } from "zod";

export const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(140).optional(),
});
export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(140).optional(),
  parentCategoryId: z.string().uuid().optional(),
});
export const createFlavorSchema = z.object({
  name: z.string().min(1).max(120),
});
export const createUnitSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(60),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(220).optional(),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
});
export const updateProductSchema = createProductSchema.partial();

export const createVariantSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  flavorId: z.string().uuid().optional(),
  purchaseUnitId: z.string().uuid(),
  salesUnitId: z.string().uuid(),
  unitsPerPurchaseUnit: z.coerce.number().int().positive().default(1),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  barcode: z.string().max(64).optional(),
  barcodeType: z.enum(["EAN", "UPC", "CODE128", "QR_INTERNAL", "OTHER"]).optional(),
});

export const addBarcodeSchema = z.object({
  barcode: z.string().min(1).max(64),
  type: z.enum(["EAN", "UPC", "CODE128", "QR_INTERNAL", "OTHER"]).default("OTHER"),
  isPrimary: z.boolean().default(false),
});

// Alta rápida por escaneo: da de alta modelo (producto) + sabor (variante) +
// código de barras en una sola operación. Marca y sabor se resuelven por nombre
// (se crean si no existen). Base del flujo "escanear para dar de alta".
export const quickRegisterSchema = z.object({
  barcode: z.string().min(1).max(64),
  barcodeType: z.enum(["EAN", "UPC", "CODE128", "QR_INTERNAL", "OTHER"]).default("OTHER"),
  productName: z.string().min(1).max(200), // modelo
  brandName: z.string().max(120).optional(),
  flavorName: z.string().max(120).optional(), // sabor
  sku: z.string().max(64).optional(),
  price: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).default("MXN"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type AddBarcodeInput = z.infer<typeof addBarcodeSchema>;
export type QuickRegisterInput = z.infer<typeof quickRegisterSchema>;

export const productSearchSchema = z.object({
  search: z.string().max(120).optional(),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
});
export type ProductSearch = z.infer<typeof productSearchSchema>;
