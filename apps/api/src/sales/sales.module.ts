import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { CustomerService } from "./customer.service.js";
import { OrderService } from "./order.service.js";
import { SaleNoteService } from "./sale-note.service.js";
import { CustomerController, OrderController } from "./sales.controllers.js";
import { SaleNoteController } from "./sale-note.controller.js";

@Module({
  imports: [InventoryModule], // Ledger + Cost + Balance + Reservation (ADR-021)
  controllers: [CustomerController, OrderController, SaleNoteController],
  providers: [CustomerService, OrderService, SaleNoteService],
})
export class SalesModule {}
