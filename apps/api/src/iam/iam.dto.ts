import { z } from "zod";

// Registro inicial de organización (el usuario autenticado se vuelve Owner).
export const bootstrapOrganizationSchema = z.object({
  organizationName: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(140)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
    .optional(),
  branchName: z.string().min(2).max(120).default("Principal"),
  warehouseName: z.string().min(2).max(120).default("Almacén Principal"),
});
export type BootstrapOrganizationInput = z.infer<typeof bootstrapOrganizationSchema>;

export const createBranchSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(1).max(32),
  phone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = z
  .object({
    name: z.string().min(2).max(120),
    phone: z.string().max(40),
    address: z.string().max(300),
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const selectOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
});
export type SelectOrganizationInput = z.infer<typeof selectOrganizationSchema>;
