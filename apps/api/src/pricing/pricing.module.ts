import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PricingService } from "./pricing.service.js";
import { CostAdminService } from "./cost-admin.service.js";
import { PricingController } from "./pricing.controller.js";
import { CostController } from "./cost.controller.js";

@Module({
  imports: [InventoryModule], // CostService (costo promedio móvil)
  controllers: [PricingController, CostController],
  providers: [PricingService, CostAdminService],
})
export class PricingModule {}
