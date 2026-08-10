import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { ProductService } from "./product.service.js";
import {
  addBarcodeSchema,
  createProductSchema,
  createVariantSchema,
  productSearchSchema,
  updateProductSchema,
  type AddBarcodeInput,
  type CreateProductInput,
  type CreateVariantInput,
  type ProductSearch,
  type UpdateProductInput,
} from "./catalog.dto.js";

@ApiTags("products")
@Controller("products")
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @RequirePermissions("products.read")
  list(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(productSearchSchema)) q: ProductSearch) {
    return this.products.search(u.organizationId!, q);
  }

  @Get(":id")
  @RequirePermissions("products.read")
  getById(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.products.getById(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("products.create")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createProductSchema)) b: CreateProductInput) {
    return this.products.createProduct(u.organizationId!, b);
  }

  @Patch(":id")
  @RequirePermissions("products.update")
  update(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(updateProductSchema)) b: UpdateProductInput) {
    return this.products.updateProduct(u.organizationId!, id, b);
  }

  @Post(":id/variants")
  @RequirePermissions("products.update")
  createVariant(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(createVariantSchema)) b: CreateVariantInput) {
    return this.products.createVariant(u.organizationId!, id, b);
  }
}

@ApiTags("variants")
@Controller("variants")
export class VariantController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @RequirePermissions("products.read")
  list(@CurrentUser() u: AuthContext, @Query("search") search?: string) {
    return this.products.listVariants(u.organizationId!, search);
  }

  @Post(":id/barcodes")
  @RequirePermissions("products.update")
  addBarcode(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(addBarcodeSchema)) b: AddBarcodeInput) {
    return this.products.addBarcode(u.organizationId!, id, b);
  }
}
