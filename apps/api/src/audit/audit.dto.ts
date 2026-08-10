import { z } from "zod";

// Query de listado de auditoría. Paginación por cursor (id del último evento).
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
  cursor: z.string().uuid().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
