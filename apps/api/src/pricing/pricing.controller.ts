import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { PriceListType } from "@24hits/database";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PricingService } from "./pricing.service.js";
import { createPriceListSchema, setPriceItemSchema, type CreatePriceListInput, type SetPriceItemInput } from "./pricing.dto.js";

@ApiTags("pricing")
@Controller("pricing")
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get("price-lists")
  @RequirePermissions("pricing.read")
  listPriceLists(@CurrentUser() u: AuthContext) {
    return this.pricing.listPriceLists(u.organizationId!);
  }

  @Post("price-lists")
  @RequirePermissions("pricing.manage")
  createPriceList(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createPriceListSchema)) b: CreatePriceListInput) {
    return this.pricing.createPriceList(u.organizationId!, b);
  }

  @Get("price-lists/:id")
  @RequirePermissions("pricing.read")
  getPriceList(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.pricing.getPriceList(u.organizationId!, id);
  }

  @Post("price-lists/:id/items")
  @RequirePermissions("pricing.manage")
  setItemPrice(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(setPriceItemSchema)) b: SetPriceItemInput) {
    return this.pricing.setItemPrice(u.organizationId!, u.userId, id, b);
  }

  @Get("variants/:variantId/price")
  @RequirePermissions("pricing.read")
  currentPrice(@CurrentUser() u: AuthContext, @Param("variantId") variantId: string, @Query("type") type?: string) {
    return this.pricing.currentPrice(u.organizationId!, variantId, (type as PriceListType) ?? "RETAIL");
  }

  @Get("variants/:variantId/history")
  @RequirePermissions("pricing.read")
  history(@CurrentUser() u: AuthContext, @Param("variantId") variantId: string) {
    return this.pricing.priceHistory(u.organizationId!, variantId);
  }
}
