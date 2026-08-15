import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { MemberService } from "./member.service.js";
import {
  inviteMemberSchema,
  setMemberStatusSchema,
  setMemberWarehouseSchema,
  updateMemberRolesSchema,
  type InviteMemberInput,
  type SetMemberStatusInput,
  type SetMemberWarehouseInput,
  type UpdateMemberRolesInput,
} from "./member.dto.js";

@ApiTags("members")
@Controller("members")
export class MemberController {
  constructor(private readonly members: MemberService) {}

  @Get()
  @RequirePermissions("users.read")
  list(@CurrentUser() user: AuthContext) {
    return this.members.list(user.organizationId!);
  }

  @Post("invite")
  @RequirePermissions("users.invite")
  invite(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput
  ) {
    return this.members.invite(user.organizationId!, user.userId, body);
  }

  @Patch(":id/roles")
  @RequirePermissions("users.manage")
  async updateRoles(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMemberRolesSchema)) body: UpdateMemberRolesInput
  ): Promise<{ ok: boolean }> {
    await this.members.updateRoles(user.organizationId!, id, body);
    return { ok: true };
  }

  @Patch(":id/status")
  @RequirePermissions("users.manage")
  async setStatus(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setMemberStatusSchema)) body: SetMemberStatusInput
  ): Promise<{ ok: boolean }> {
    await this.members.setStatus(user.organizationId!, id, body);
    return { ok: true };
  }

  @Patch(":id/warehouse")
  @RequirePermissions("users.manage")
  async setWarehouse(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setMemberWarehouseSchema)) body: SetMemberWarehouseInput
  ): Promise<{ ok: boolean }> {
    await this.members.setDefaultWarehouse(user.organizationId!, id, body);
    return { ok: true };
  }
}
