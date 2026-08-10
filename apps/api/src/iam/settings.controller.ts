import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { SettingsService } from "./settings.service.js";
import {
  setFeatureFlagSchema,
  updateSettingsSchema,
  type SetFeatureFlagInput,
  type UpdateSettingsInput,
} from "./settings.dto.js";

@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions("organization.manage")
  get(@CurrentUser() user: AuthContext) {
    return this.settings.get(user.organizationId!);
  }

  @Patch()
  @RequirePermissions("organization.manage")
  update(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput
  ) {
    return this.settings.update(user.organizationId!, body);
  }

  @Post("feature-flags")
  @RequirePermissions("organization.manage")
  setFeatureFlag(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(setFeatureFlagSchema)) body: SetFeatureFlagInput
  ) {
    return this.settings.setFeatureFlag(user.organizationId!, body);
  }
}
