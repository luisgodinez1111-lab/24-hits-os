import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { RoleService } from "./role.service.js";
import {
  createRoleSchema,
  updateRolePermissionsSchema,
  type CreateRoleInput,
  type UpdateRolePermissionsInput,
} from "./role.dto.js";

@ApiTags("roles")
@Controller("roles")
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get("permissions")
  @RequirePermissions("roles.read")
  permissionCatalog() {
    return this.roles.permissionCatalog();
  }

  @Get()
  @RequirePermissions("roles.read")
  list(@CurrentUser() user: AuthContext) {
    return this.roles.list(user.organizationId!);
  }

  @Post()
  @RequirePermissions("roles.manage")
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput
  ) {
    return this.roles.create(user.organizationId!, body);
  }

  @Patch(":id/permissions")
  @RequirePermissions("roles.manage")
  async updatePermissions(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRolePermissionsSchema)) body: UpdateRolePermissionsInput
  ): Promise<{ ok: boolean }> {
    await this.roles.updatePermissions(user.organizationId!, id, body);
    return { ok: true };
  }
}
