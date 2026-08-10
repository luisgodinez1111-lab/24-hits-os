import { z } from "zod";

export const createRoleSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo"),
  name: z.string().min(2).max(120),
  description: z.string().max(300).optional(),
  permissionKeys: z.array(z.string()).min(1, "Selecciona al menos un permiso"),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string()).min(1, "Selecciona al menos un permiso"),
});
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
