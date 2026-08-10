import { z } from "zod";

const qty = z.coerce.number().positive();

export const openingBalanceSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: qty,
  unitCost: z.coerce.number().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type OpeningBalanceBody = z.infer<typeof openingBalanceSchema>;

export const manualAdjustmentSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: qty,
  direction: z.enum(["IN", "OUT"]),
  reasonCode: z.enum(["DATA_CORRECTION", "DAMAGE", "LOSS", "THEFT", "INITIAL_COUNT", "COUNT_DIFFERENCE", "OTHER"]),
  reasonText: z.string().min(1).max(500),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type ManualAdjustmentBody = z.infer<typeof manualAdjustmentSchema>;

export const damageSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: qty,
  reasonText: z.string().min(1).max(500),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type DamageBody = z.infer<typeof damageSchema>;

export const reserveSchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: qty,
  branchId: z.string().uuid().optional(),
  referenceType: z.string().max(60).optional(),
  referenceId: z.string().uuid().optional(),
  expiresAt: z.coerce.date().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
export type ReserveBody = z.infer<typeof reserveSchema>;

export const movementsQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

export const balancesQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  lowStock: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type BalancesQuery = z.infer<typeof balancesQuerySchema>;
