import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { TransferService } from "./transfer.service.js";
import { TransferController } from "./transfer.controller.js";

@Module({
  imports: [InventoryModule], // LedgerService + BalanceService
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransfersModule {}
