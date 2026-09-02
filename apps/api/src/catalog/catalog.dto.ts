import { z } from "zod";

export const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(140).optional(),
});

// Editar marca: renombrar y/o dar de baja/reactivar (status).
export const updateBrandSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((b) => b.name !== undefined || b.status !== undefined, { message: "Nada que actualizar" });
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
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

// Alta de un SABOR (variante) de un modelo. Diseño "fácil": basta el nombre del
// sabor — SKU y unidad se autogeneran si no se indican. Precio y código de barras
// son opcionales (el código suele escanearse después).
export const createVariantSchema = z.object({
  sku: z.string().min(1).max(64).optional(), // autogenerado si se omite
  name: z.string().min(1).max(200).optional(), // por defecto = nombre del sabor
  flavorId: z.string().uuid().optional(),
  flavorName: z.string().min(1).max(120).optional(), // se busca/crea por nombre
  purchaseUnitId: z.string().uuid().optional(), // por defecto = unidad "Pieza"
  salesUnitId: z.string().uuid().optional(),
  unitsPerPurchaseUnit: z.coerce.number().int().positive().default(1),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  barcode: z.string().max(64).optional(),
  barcodeType: z.enum(["EAN", "UPC", "CODE128", "QR_INTERNAL", "OTHER"]).optional(),
  price: z.coerce.number().nonnegative().optional(), // precio de venta (lista RETAIL)
  currency: z.string().length(3).default("MXN"),
});

export const addBarcodeSchema = z.object({
  barcode: z.string().min(1).max(64),
  type: z.enum(["EAN", "UPC", "CODE128", "QR_INTERNAL", "OTHER"]).default("OTHER"),
  isPrimary: z.boolean().default(false),
});

// Dar de baja / reactivar un sabor (variante): cambia su status. Borrado lógico
// reversible; conserva historial (a diferencia del DELETE que borra los sin uso).
export const setVariantStatusSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "DISCONTINUED"]),
});
export type SetVariantStatusInput = z.infer<typeof setVariantStatusSchema>;

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
