import { z } from "zod";

// --- Cajas ---
export const createRegisterSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
});
export type CreateRegisterInput = z.infer<typeof createRegisterSchema>;

// --- Turnos de caja ---
export const openSessionSchema = z.object({
  registerId: z.string().uuid(),
  openingFloat: z.coerce.number().nonnegative().default(0),
  notes: z.string().max(500).optional(),
});
export type OpenSessionInput = z.infer<typeof openSessionSchema>;

export const closeSessionSchema = z.object({
  countedCash: z.coerce.number().nonnegative(),
  notes: z.string().max(500).optional(),
});
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;

export const cashMovementSchema = z.object({
  cashSessionId: z.string().uuid(),
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "EXPENSE"]),
  amount: z.coerce.number().positive(),
  reason: z.string().min(1).max(500),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

// --- Pagos ---
export const recordPaymentSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).optional(),
  reference: z.string().max(120).optional(),
  // Obligatorio cuando method = CASH (se valida en el servicio).
  cashSessionId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
