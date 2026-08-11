import { Module } from "@nestjs/common";
import { CashService } from "./cash.service.js";
import { PaymentService } from "./payment.service.js";
import {
  CashRegisterController,
  CashSessionController,
  PaymentController,
} from "./cash.controllers.js";

@Module({
  controllers: [CashRegisterController, CashSessionController, PaymentController],
  providers: [CashService, PaymentService],
})
export class CashModule {}
