import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { StockCountService } from "./stock-count.service.js";
import {
  captureCountsSchema,
  createStockCountSchema,
  type CaptureCountsInput,
  type CreateStockCountInput,
} from "./stock-count.dto.js";

@ApiTags("stock-counts")
@Controller("stock-counts")
export class StockCountController {
  constructor(private readonly counts: StockCountService) {}

  @Get()
  @RequirePermissions("inventory.count")
  list(@CurrentUser() u: AuthContext) {
    return this.counts.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("inventory.count")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.counts.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("inventory.count")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createStockCountSchema)) b: CreateStockCountInput) {
    return this.counts.create(u.organizationId!, u.userId, b);
  }

  @Post(":id/start")
  @RequirePermissions("inventory.count")
  start(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.counts.start(u.organizationId!, u.userId, id);
  }

  @Post(":id/count")
  @RequirePermissions("inventory.count")
  capture(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(captureCountsSchema)) b: CaptureCountsInput) {
    return this.counts.capture(u.organizationId!, id, b);
  }

  @Post(":id/submit")
  @RequirePermissions("inventory.count")
  submit(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.counts.submit(u.organizationId!, id);
  }

  @Post(":id/approve")
  @RequirePermissions("inventory.count.approve")
  approve(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.counts.approve(u.organizationId!, u.userId, id);
  }

  @Post(":id/apply")
  @RequirePermissions("inventory.count.approve")
  apply(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.counts.apply(u.organizationId!, u.userId, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("inventory.count")
  cancel(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.counts.cancel(u.organizationId!, id);
  }
}
