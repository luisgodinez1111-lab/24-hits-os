import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { TransferService } from "./transfer.service.js";
import {
  createTransferSchema,
  receiveTransferSchema,
  shipTransferSchema,
  type CreateTransferInput,
  type ReceiveTransferInput,
  type ShipTransferInput,
} from "./transfer.dto.js";

@ApiTags("transfers")
@Controller("transfers")
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Get()
  @RequirePermissions("inventory.read")
  list(@CurrentUser() u: AuthContext) {
    return this.transfers.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("inventory.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.transfers.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("inventory.transfer.create")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createTransferSchema)) b: CreateTransferInput) {
    return this.transfers.create(u.organizationId!, u.userId, b);
  }

  @Post(":id/request")
  @RequirePermissions("inventory.transfer.create")
  request(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.transfers.request(u.organizationId!, id);
  }

  @Post(":id/approve")
  @RequirePermissions("inventory.transfer.approve")
  approve(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.transfers.approve(u.organizationId!, u.userId, id);
  }

  @Post(":id/ship")
  @RequirePermissions("inventory.transfer.ship")
  ship(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(shipTransferSchema)) b: ShipTransferInput) {
    return this.transfers.ship(u.organizationId!, u.userId, id, b);
  }

  @Post(":id/receive")
  @RequirePermissions("inventory.transfer.receive")
  receive(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(receiveTransferSchema)) b: ReceiveTransferInput) {
    return this.transfers.receive(u.organizationId!, u.userId, id, b);
  }

  @Post(":id/cancel")
  @RequirePermissions("inventory.transfer.create")
  cancel(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.transfers.cancel(u.organizationId!, id);
  }
}
