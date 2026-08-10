import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CatalogService } from "./catalog.service.js";
import {
  createBrandSchema,
  createCategorySchema,
  createFlavorSchema,
  createUnitSchema,
} from "./catalog.dto.js";

@ApiTags("brands")
@Controller("brands")
export class BrandController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions("brands.read")
  list(@CurrentUser() u: AuthContext) {
    return this.catalog.listBrands(u.organizationId!);
  }

  @Post()
  @RequirePermissions("brands.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createBrandSchema)) b: { name: string; slug?: string }) {
    return this.catalog.createBrand(u.organizationId!, b);
  }
}

@ApiTags("categories")
@Controller("categories")
export class CategoryController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions("categories.read")
  list(@CurrentUser() u: AuthContext) {
    return this.catalog.listCategories(u.organizationId!);
  }

  @Post()
  @RequirePermissions("categories.manage")
  create(
    @CurrentUser() u: AuthContext,
    @Body(new ZodValidationPipe(createCategorySchema)) b: { name: string; slug?: string; parentCategoryId?: string }
  ) {
    return this.catalog.createCategory(u.organizationId!, b);
  }
}

@ApiTags("flavors")
@Controller("flavors")
export class FlavorController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions("flavors.read")
  list(@CurrentUser() u: AuthContext) {
    return this.catalog.listFlavors(u.organizationId!);
  }

  @Post()
  @RequirePermissions("flavors.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createFlavorSchema)) b: { name: string }) {
    return this.catalog.createFlavor(u.organizationId!, b);
  }
}

@ApiTags("units")
@Controller("units")
export class UnitController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions("catalog.read")
  list(@CurrentUser() u: AuthContext) {
    return this.catalog.listUnits(u.organizationId!);
  }

  @Post()
  @RequirePermissions("catalog.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createUnitSchema)) b: { code: string; name: string }) {
    return this.catalog.createUnit(u.organizationId!, b);
  }
}
