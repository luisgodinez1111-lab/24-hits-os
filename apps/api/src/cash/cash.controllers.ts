import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { AppException } from "../common/errors/app-exception.js";
import { CashService } from "./cash.service.js";
import { PaymentService } from "./payment.service.js";
import {
  cashMovementSchema,
  closeSessionSchema,
  createRegisterSchema,
  openSessionSchema,
  recordPaymentSchema,
  type CashMovementInput,
  type CloseSessionInput,
  type CreateRegisterInput,
  type OpenSessionInput,
  type RecordPaymentInput,
} from "./cash.dto.js";

@ApiTags("cash-registers")
@Controller("cash-registers")
export class CashRegisterController {
  constructor(private readonly cash: CashService) {}

  @Get()
  @RequirePermissions("cash.read")
  list(@CurrentUser() u: AuthContext) {
    return this.cash.listRegisters(u.organizationId!);
  }

  @Post()
  @RequirePermissions("cash.manage")
  create(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(createRegisterSchema)) b: CreateRegisterInput) {
    return this.cash.createRegister(u.organizationId!, b);
  }
}

@ApiTags("cash-sessions")
@Controller("cash-sessions")
export class CashSessionController {
  constructor(private readonly cash: CashService) {}

  @Get()
  @RequirePermissions("cash.read")
  list(@CurrentUser() u: AuthContext) {
    return this.cash.listSessions(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("cash.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.cash.getSession(u.organizationId!, id);
  }

  @Post("open")
  @RequirePermissions("cash.session.open")
  open(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(openSessionSchema)) b: OpenSessionInput) {
    return this.cash.open(u.organizationId!, u.userId, b);
  }

  @Post(":id/close")
  @RequirePermissions("cash.session.close")
  close(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(closeSessionSchema)) b: CloseSessionInput) {
    return this.cash.close(u.organizationId!, u.userId, id, b);
  }

  @Post("movements")
  @RequirePermissions("cash.movement")
  movement(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(cashMovementSchema)) b: CashMovementInput) {
    return this.cash.movement(u.organizationId!, u.userId, b);
  }
}

@ApiTags("payments")
@Controller("payments")
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get()
  @RequirePermissions("payments.read")
  list(@CurrentUser() u: AuthContext, @Query("orderId") orderId?: string) {
    if (!orderId) throw AppException.badRequest("Parámetro orderId requerido");
    return this.payments.listByOrder(u.organizationId!, orderId);
  }

  @Post()
  @RequirePermissions("payments.record")
  record(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(recordPaymentSchema)) b: RecordPaymentInput) {
    return this.payments.record(u.organizationId!, u.userId, b);
  }

  @Post(":id/reverse")
  @RequirePermissions("payments.reverse")
  reverse(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.payments.reverse(u.organizationId!, u.userId, id);
  }
}
