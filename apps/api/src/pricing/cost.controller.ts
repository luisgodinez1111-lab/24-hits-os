import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CostAdminService } from "./cost-admin.service.js";
import { initCostSchema, type InitCostInput } from "./pricing.dto.js";

// Los costos se filtran en el BACKEND: todos los endpoints exigen costs.read/manage.
@ApiTags("costs")
@Controller("costs")
export class CostController {
  constructor(private readonly costs: CostAdminService) {}

  @Get("variants/:variantId")
  @RequirePermissions("costs.read")
  getCost(@CurrentUser() u: AuthContext, @Param("variantId") variantId: string) {
    return this.costs.getCost(u.organizationId!, variantId);
  }

  @Get("variants/:variantId/history")
  @RequirePermissions("costs.read")
  history(@CurrentUser() u: AuthContext, @Param("variantId") variantId: string) {
    return this.costs.history(u.organizationId!, variantId);
  }

  @Post("variants/:variantId/initialize")
  @RequirePermissions("costs.manage")
  initialize(@CurrentUser() u: AuthContext, @Param("variantId") variantId: string, @Body(new ZodValidationPipe(initCostSchema)) b: InitCostInput) {
    return this.costs.initialize(u.organizationId!, u.userId, variantId, b.unitCost);
  }
}
