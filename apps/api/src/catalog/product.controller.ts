import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
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
  quickRegisterSchema,
  setVariantStatusSchema,
  updateProductSchema,
  type AddBarcodeInput,
  type CreateProductInput,
  type CreateVariantInput,
  type ProductSearch,
  type QuickRegisterInput,
  type SetVariantStatusInput,
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

  // Alta rápida por escaneo: modelo + sabor + código de barras (+ precio) en una llamada.
  @Post("quick-register")
  @RequirePermissions("products.create")
  quickRegister(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(quickRegisterSchema)) b: QuickRegisterInput) {
    return this.products.quickRegister(u.organizationId!, b);
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

  // Elimina un modelo (con sus sabores). Borra de verdad si nunca se usó; si tiene
  // historial lo desactiva (la respuesta indica cuál ocurrió).
  @Delete(":id")
  @RequirePermissions("products.update")
  remove(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.products.deleteProduct(u.organizationId!, id);
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

  // Dar de baja / reactivar un sabor (cambia status; reversible, conserva historial).
  @Patch(":id")
  @RequirePermissions("products.update")
  setStatus(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(setVariantStatusSchema)) b: SetVariantStatusInput) {
    return this.products.setVariantStatus(u.organizationId!, id, b.status);
  }

  // Elimina un sabor. Borra de verdad si nunca se usó; si tiene historial lo desactiva
  // (la respuesta indica cuál de las dos ocurrió). Es una edición de catálogo → products.update.
  @Delete(":id")
  @RequirePermissions("products.update")
  remove(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.products.deleteVariant(u.organizationId!, id);
  }
}
