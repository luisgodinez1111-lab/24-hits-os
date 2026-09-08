import { Module } from "@nestjs/common";
import { IamModule } from "../iam/iam.module.js";
import { CatalogService } from "./catalog.service.js";
import { ProductService } from "./product.service.js";
import { ProductImageService } from "./product-image.service.js";
import {
  BrandController,
  CategoryController,
  FlavorController,
  UnitController,
} from "./catalog.controllers.js";
import { ProductController, VariantController } from "./product.controller.js";
import { ProductImageController } from "./product-image.controller.js";

@Module({
  imports: [IamModule], // PermissionService para exponer costo solo con costs.read
  controllers: [
    BrandController,
    CategoryController,
    FlavorController,
    UnitController,
    ProductController,
    VariantController,
    ProductImageController,
  ],
  providers: [CatalogService, ProductService, ProductImageService],
  exports: [CatalogService, ProductService],
})
export class CatalogModule {}
