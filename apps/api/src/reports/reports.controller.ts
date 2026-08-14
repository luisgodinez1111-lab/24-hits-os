import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { ReportsService } from "./reports.service.js";
import { reportRangeSchema, salesRegisterQuerySchema, topSellersQuerySchema, type ReportRangeInput, type SalesRegisterQuery, type TopSellersQuery } from "./reports.dto.js";

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // KPIs de ventas. Los campos de utilidad se añaden solo si el usuario tiene
  // profits.read (el servicio lo resuelve con la membresía).
  @Get("sales")
  @RequirePermissions("reports.read")
  sales(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(reportRangeSchema)) q: ReportRangeInput) {
    return this.reports.salesSummary(u.organizationId!, q, u.membershipId);
  }

  @Get("profit-by-product")
  @RequirePermissions("reports.read", "profits.read")
  profitByProduct(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(reportRangeSchema)) q: ReportRangeInput) {
    return this.reports.profitByProduct(u.organizationId!, q);
  }

  // Registro de ventas (diario transaccional). Costo/utilidad se añaden si hay profits.read.
  @Get("sales-register")
  @RequirePermissions("reports.read")
  salesRegister(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(salesRegisterQuerySchema)) q: SalesRegisterQuery) {
    return this.reports.salesRegister(u.organizationId!, q, u.membershipId);
  }

  // Más vendidos por modelo/marca/sabor + devoluciones. Costo/utilidad si hay profits.read.
  @Get("top-sellers")
  @RequirePermissions("reports.read")
  topSellers(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(topSellersQuerySchema)) q: TopSellersQuery) {
    return this.reports.topSellers(u.organizationId!, q, u.membershipId);
  }

  @Get("cash-cut/:sessionId")
  @RequirePermissions("cash.read")
  cashCut(@CurrentUser() u: AuthContext, @Param("sessionId") sessionId: string) {
    return this.reports.cashCut(u.organizationId!, sessionId);
  }
}
