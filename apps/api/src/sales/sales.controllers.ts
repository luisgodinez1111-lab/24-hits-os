import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CustomerService } from "./customer.service.js";
import { OrderService } from "./order.service.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
  createOrderSchema,
  updateDeliverySchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CreateOrderInput,
  type UpdateDeliveryInput,
} from "./sales.dto.js";

@ApiTags("customers")
@Controller("customers")
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  @RequirePermissions("customers.read")
  list(@CurrentUser() u: AuthContext) {
    return this.customers.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("customers.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.customers.get(u.organizationId!, id);
  }

  @Get(":id/account")
  @RequirePermissions("customers.read")
  account(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.customers.account(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("customers.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createCustomerSchema)) b: CreateCustomerInput) {
    return this.customers.create(u.organizationId!, b);
  }

  @Patch(":id")
  @RequirePermissions("customers.manage")
  update(
    @CurrentUser() u: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) b: UpdateCustomerInput
  ) {
    return this.customers.update(u.organizationId!, id, b);
  }
}

@ApiTags("orders")
@Controller("orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @RequirePermissions("orders.read")
  list(@CurrentUser() u: AuthContext) {
    return this.orders.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("orders.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("orders.create")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createOrderSchema)) b: CreateOrderInput) {
    return this.orders.create(u.organizationId!, u.userId, b);
  }

  @Post(":id/confirm")
  @RequirePermissions("orders.confirm")
  confirm(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.confirm(u.organizationId!, u.userId, id);
  }

  @Post(":id/fulfill")
  @RequirePermissions("orders.fulfill")
  fulfill(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.fulfill(u.organizationId!, u.userId, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("orders.cancel")
  cancel(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.orders.cancel(u.organizationId!, id);
  }

  @Patch(":id/delivery")
  @RequirePermissions("orders.create")
  updateDelivery(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(updateDeliverySchema)) b: UpdateDeliveryInput) {
    return this.orders.updateDelivery(u.organizationId!, id, b);
  }
}
