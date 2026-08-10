import { Module } from "@nestjs/common";
import { PermissionService } from "./permission.service.js";
import { OrganizationService } from "./organization.service.js";
import { BranchService } from "./branch.service.js";
import { WarehouseService } from "./warehouse.service.js";
import { MemberService } from "./member.service.js";
import { RoleService } from "./role.service.js";
import { SettingsService } from "./settings.service.js";
import { OrganizationController } from "./organization.controller.js";
import { BranchController } from "./branch.controller.js";
import { WarehouseController } from "./warehouse.controller.js";
import { MemberController } from "./member.controller.js";
import { RoleController } from "./role.controller.js";
import { SettingsController } from "./settings.controller.js";
import { MeController } from "./me.controller.js";

@Module({
  controllers: [
    OrganizationController,
    BranchController,
    WarehouseController,
    MemberController,
    RoleController,
    SettingsController,
    MeController,
  ],
  providers: [
    PermissionService,
    OrganizationService,
    BranchService,
    WarehouseService,
    MemberService,
    RoleService,
    SettingsService,
  ],
  exports: [PermissionService, OrganizationService],
})
export class IamModule {}
