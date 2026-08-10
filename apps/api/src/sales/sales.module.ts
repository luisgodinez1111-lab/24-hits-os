import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { CustomerService } from "./customer.service.js";
import { OrderService } from "./order.service.js";
import { CustomerController, OrderController } from "./sales.controllers.js";

@Module({
  imports: [InventoryModule], // Ledger + Cost + Balance + Reservation (ADR-021)
  controllers: [CustomerController, OrderController],
  providers: [CustomerService, OrderService],
})
export class SalesModule {}
