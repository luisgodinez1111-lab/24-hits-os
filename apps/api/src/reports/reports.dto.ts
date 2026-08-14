import { z } from "zod";

// Rango de fechas para los reportes. Por defecto: últimos 30 días.
export const reportRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().uuid().optional(),
});
export type ReportRangeInput = z.infer<typeof reportRangeSchema>;

// Registro de ventas (diario transaccional). Rango + filtros por cliente y estado.
export const salesRegisterQuerySchema = reportRangeSchema.extend({
  customerId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED", "COMPLETED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["PENDING", "PARTIAL", "PAID"]).optional(),
});
export type SalesRegisterQuery = z.infer<typeof salesRegisterQuerySchema>;

// Análisis de más vendidos por dimensión (modelo/marca/sabor) + devoluciones.
export const topSellersQuerySchema = reportRangeSchema.extend({
  dimension: z.enum(["product", "brand", "flavor"]).default("product"),
  productId: z.string().uuid().optional(), // p.ej. sabores de UN modelo
  sort: z.enum(["units", "returns"]).default("units"), // más vendidos vs más devueltos
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TopSellersQuery = z.infer<typeof topSellersQuerySchema>;
