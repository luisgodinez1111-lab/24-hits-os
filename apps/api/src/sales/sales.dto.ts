import { z } from "zod";

// --- Clientes ---
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  taxId: z.string().max(40).optional(),
  type: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
  creditLimit: z.coerce.number().nonnegative().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  taxId: z.string().max(40).nullable().optional(),
  type: z.enum(["RETAIL", "WHOLESALE"]).optional(),
  creditLimit: z.coerce.number().nonnegative().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// --- Pedidos ---
export const createOrderSchema = z.object({
  // Opcional: si se omite se usa el almacén fijo del usuario (operación por usuario).
  warehouseId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  channel: z.string().max(40).optional(),
  currency: z.string().length(3).default("MXN"),
  // Lista de precios explícita; si se omite se resuelve por tipo de cliente.
  priceListId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  // Entrega a domicilio (pedidos por WhatsApp).
  deliveryAddress: z.string().max(500).optional(),
  deliveryPhone: z.string().max(40).optional(),
  deliveryNotes: z.string().max(500).optional(),
  deliveryLocationUrl: z.string().url().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        // Precio explícito (override). Si se omite se toma de la lista de precios.
        unitPrice: z.coerce.number().nonnegative().optional(),
        discount: z.coerce.number().nonnegative().default(0),
        taxRate: z.coerce.number().min(0).max(1).default(0),
      })
    )
    .min(1, "Agrega al menos un renglón"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// Actualiza la entrega del pedido (estado y/o datos de domicilio).
export const updateDeliverySchema = z.object({
  status: z.enum(["PENDING", "DISPATCHED", "DELIVERED"]).optional(),
  deliveryAddress: z.string().max(500).optional(),
  deliveryPhone: z.string().max(40).optional(),
  deliveryNotes: z.string().max(500).optional(),
  deliveryLocationUrl: z.string().url().max(500).optional(),
});
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;
