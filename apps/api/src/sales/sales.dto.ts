import { z } from "zod";

// --- Seguimiento en vivo del repartidor ---
export const driverLocationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type DriverLocationInput = z.infer<typeof driverLocationSchema>;

// --- Clientes ---
const customerZone = z.enum(["NORTE", "SUR", "ESTE", "OESTE", "CENTRO"]);

export const createCustomerSchema = z.object({
  code: z.string().max(40).optional(), // si se omite se autogenera (C-0001)
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  zone: customerZone.optional(),
  taxId: z.string().max(40).optional(),
  type: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
  creditLimit: z.coerce.number().nonnegative().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// Clientes inactivos: que compraron antes pero llevan >= N días sin comprar.
export const inactiveCustomersQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(30),
});
export type InactiveCustomersQuery = z.infer<typeof inactiveCustomersQuerySchema>;

export const updateCustomerSchema = z.object({
  code: z.string().max(40).nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  zone: customerZone.nullable().optional(),
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
  deliveryLocationUrl: z.string().max(500).optional(), // link de Google/Apple Maps o "lat,lng"
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
  deliveryLocationUrl: z.string().max(500).optional(), // link de Google/Apple Maps o "lat,lng"
  // Geo-sello de la prueba de entrega: ubicación del REPARTIDOR al marcar DELIVERED.
  deliveredLat: z.number().min(-90).max(90).optional(),
  deliveredLng: z.number().min(-180).max(180).optional(),
  deliveredAccuracy: z.number().min(0).max(100000).optional(), // precisión GPS en metros
  deliveryRecipient: z.string().max(120).optional(), // quién recibió (nombre)
});
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;

// Entrega del efectivo de reparto a un turno de caja abierto (corte del repartidor).
export const cashHandoverSchema = z.object({
  cashSessionId: z.string().uuid(),
});
export type CashHandoverInput = z.infer<typeof cashHandoverSchema>;
