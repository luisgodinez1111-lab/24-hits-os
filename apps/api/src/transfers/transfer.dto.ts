import { z } from "zod";

export const createTransferSchema = z
  .object({
    sourceWarehouseId: z.string().uuid(),
    destinationWarehouseId: z.string().uuid(),
    notes: z.string().max(500).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    items: z
      .array(
        z.object({
          variantId: z.string().uuid(),
          requestedQuantity: z.coerce.number().positive(),
        })
      )
      .min(1, "Agrega al menos un renglón"),
  })
  .refine((v) => v.sourceWarehouseId !== v.destinationWarehouseId, {
    message: "El almacén origen y destino no pueden ser el mismo",
    path: ["destinationWarehouseId"],
  });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

// Enviar/recibir: cantidades por renglón (itemId). Si se omite, se usa lo solicitado.
export const shipTransferSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number().nonnegative() }))
    .optional(),
});
export type ShipTransferInput = z.infer<typeof shipTransferSchema>;

export const receiveTransferSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number().nonnegative() }))
    .min(1, "Indica las cantidades recibidas"),
});
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;
