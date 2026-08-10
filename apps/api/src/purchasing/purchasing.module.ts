import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PurchaseOrderService } from "./purchase-order.service.js";
import { PurchaseReceiptService } from "./purchase-receipt.service.js";
import {
  PurchaseOrderController,
  PurchaseReceiptController,
  SupplierReturnController,
} from "./purchasing.controllers.js";

@Module({
  imports: [InventoryModule], // LedgerService + CostService (ADR-019)
  controllers: [PurchaseOrderController, PurchaseReceiptController, SupplierReturnController],
  providers: [PurchaseOrderService, PurchaseReceiptService],
})
export class PurchasingModule {}
