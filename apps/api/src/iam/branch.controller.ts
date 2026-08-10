import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { BranchService } from "./branch.service.js";
import {
  createBranchSchema,
  updateBranchSchema,
  type CreateBranchInput,
  type UpdateBranchInput,
} from "./iam.dto.js";

@ApiTags("branches")
@Controller("branches")
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Get()
  @RequirePermissions("branches.read")
  list(@CurrentUser() user: AuthContext) {
    return this.branches.list(user.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("branches.read")
  getById(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.branches.getById(user.organizationId!, id);
  }

  @Post()
  @RequirePermissions("branches.create")
  create(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(createBranchSchema)) body: CreateBranchInput
  ) {
    return this.branches.create(user.organizationId!, body);
  }

  @Patch(":id")
  @RequirePermissions("branches.update")
  update(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput
  ) {
    return this.branches.update(user.organizationId!, id, body);
  }
}
