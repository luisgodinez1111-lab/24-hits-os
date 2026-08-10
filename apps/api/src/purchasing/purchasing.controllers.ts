import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PurchaseOrderService } from "./purchase-order.service.js";
import { PurchaseReceiptService } from "./purchase-receipt.service.js";
import {
  createPurchaseOrderSchema,
  createReceiptSchema,
  supplierReturnSchema,
  type CreatePurchaseOrderInput,
  type CreateReceiptInput,
  type SupplierReturnInput,
} from "./purchasing.dto.js";

@ApiTags("purchase-orders")
@Controller("purchase-orders")
export class PurchaseOrderController {
  constructor(private readonly orders: PurchaseOrderService) {}

  @Get()
  @RequirePermissions("purchasing.read")
  list(@CurrentUser() u: AuthContext) {
    return this.orders.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("purchasing.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("purchase.order.create")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createPurchaseOrderSchema)) b: CreatePurchaseOrderInput) {
    return this.orders.create(u.organizationId!, u.userId, b);
  }

  @Post(":id/submit")
  @RequirePermissions("purchase.order.create")
  submit(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.submit(u.organizationId!, id);
  }

  @Post(":id/approve")
  @RequirePermissions("purchase.order.approve")
  approve(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.approve(u.organizationId!, u.userId, id);
  }

  @Post(":id/order")
  @RequirePermissions("purchase.order.approve")
  order(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.order(u.organizationId!, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("purchase.order.create")
  cancel(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.cancel(u.organizationId!, id);
  }
}

@ApiTags("purchase-receipts")
@Controller("purchase-receipts")
export class PurchaseReceiptController {
  constructor(private readonly receipts: PurchaseReceiptService) {}

  @Get()
  @RequirePermissions("purchasing.read")
  list(@CurrentUser() u: AuthContext) {
    return this.receipts.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("purchasing.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.receipts.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("purchase.receipt.post")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createReceiptSchema)) b: CreateReceiptInput) {
    return this.receipts.create(u.organizationId!, u.userId, b);
  }

  @Post(":id/post")
  @RequirePermissions("purchase.receipt.post")
  post(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.receipts.post(u.organizationId!, u.userId, id);
  }
}

@ApiTags("supplier-returns")
@Controller("supplier-returns")
export class SupplierReturnController {
  constructor(private readonly receipts: PurchaseReceiptService) {}

  @Post()
  @RequirePermissions("purchase.return")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(supplierReturnSchema)) b: SupplierReturnInput) {
    return this.receipts.supplierReturn(u.organizationId!, u.userId, b);
  }
}
