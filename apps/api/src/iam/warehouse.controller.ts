import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { WarehouseService } from "./warehouse.service.js";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
} from "./warehouse.dto.js";

@ApiTags("warehouses")
@Controller("warehouses")
export class WarehouseController {
  constructor(private readonly warehouses: WarehouseService) {}

  @Get()
  @RequirePermissions("warehouses.read")
  list(@CurrentUser() user: AuthContext, @Query("branchId") branchId?: string) {
    return this.warehouses.list(user.organizationId!, branchId);
  }

  @Post()
  @RequirePermissions("warehouses.create")
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseInput
  ) {
    return this.warehouses.create(user.organizationId!, body);
  }

  @Patch(":id")
  @RequirePermissions("warehouses.update")
  update(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) body: UpdateWarehouseInput
  ) {
    return this.warehouses.update(user.organizationId!, id, body);
  }
}
