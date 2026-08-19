import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { CashModule } from "../cash/cash.module.js";
import { CustomerService } from "./customer.service.js";
import { OrderService } from "./order.service.js";
import { SaleNoteService } from "./sale-note.service.js";
import { CreditNoteService } from "./credit-note.service.js";
import { PosService } from "./pos.service.js";
import { DeliveryTrackingService } from "./delivery-tracking.service.js";
import { CustomerController, DeliveryController, OrderController } from "./sales.controllers.js";
import { SaleNoteController } from "./sale-note.controller.js";
import { CreditNoteController } from "./credit-note.controller.js";
import { PosController } from "./pos.controller.js";

@Module({
  imports: [InventoryModule, CashModule], // Ledger/Cost/Reservation + PaymentService (POS)
  controllers: [CustomerController, OrderController, DeliveryController, SaleNoteController, CreditNoteController, PosController],
  providers: [CustomerService, OrderService, SaleNoteService, CreditNoteService, PosService, DeliveryTrackingService],
})
export class SalesModule {}
