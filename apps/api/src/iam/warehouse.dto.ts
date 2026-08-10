import { z } from "zod";

export const createWarehouseSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(32),
  type: z.enum(["MAIN", "COUNTER", "DELIVERY"]).default("MAIN"),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = z
  .object({
    name: z.string().min(2).max(120),
    code: z.string().min(1).max(32),
    type: z.enum(["MAIN", "COUNTER", "DELIVERY"]),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .partial();
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
