import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { StockCountService } from "./stock-count.service.js";
import { StockCountController } from "./stock-count.controller.js";

@Module({
  imports: [InventoryModule], // LedgerService
  controllers: [StockCountController],
  providers: [StockCountService],
})
export class StockCountsModule {}
