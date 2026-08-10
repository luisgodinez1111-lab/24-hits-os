import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { SupplierService } from "./supplier.service.js";
import {
  createSupplierSchema,
  setSupplierReferenceSchema,
  updateSupplierSchema,
  type CreateSupplierInput,
  type SetSupplierReferenceInput,
  type UpdateSupplierInput,
} from "./supplier.dto.js";

@ApiTags("suppliers")
@Controller("suppliers")
export class SupplierController {
  constructor(private readonly suppliers: SupplierService) {}

  @Get()
  @RequirePermissions("suppliers.read")
  list(
    @CurrentUser() u: AuthContext,
    @Query("search") search?: string,
    @Query("status") status?: "ACTIVE" | "INACTIVE"
  ) {
    return this.suppliers.list(u.organizationId!, { search, status });
  }

  @Get(":id")
  @RequirePermissions("suppliers.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.suppliers.getById(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("suppliers.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createSupplierSchema)) b: CreateSupplierInput) {
    return this.suppliers.create(u.organizationId!, b);
  }

  @Patch(":id")
  @RequirePermissions("suppliers.manage")
  update(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(updateSupplierSchema)) b: UpdateSupplierInput) {
    return this.suppliers.update(u.organizationId!, id, b);
  }

  @Post(":id/references")
  @RequirePermissions("suppliers.manage")
  setReference(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(setSupplierReferenceSchema)) b: SetSupplierReferenceInput) {
    return this.suppliers.setReference(u.organizationId!, id, b);
  }
}
