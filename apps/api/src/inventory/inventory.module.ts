import { Module } from "@nestjs/common";
import { IamModule } from "../iam/iam.module.js";
import { BalanceService } from "./balance.service.js";
import { LedgerService } from "./ledger.service.js";
import { CostService } from "./cost.service.js";
import { ReservationService } from "./reservation.service.js";
import { InventoryService } from "./inventory.service.js";
import { InventoryController } from "./inventory.controller.js";

@Module({
  imports: [IamModule], // PermissionService para gating de costos
  controllers: [InventoryController],
  providers: [
    BalanceService,
    LedgerService,
    CostService,
    ReservationService,
    InventoryService,
  ],
  exports: [BalanceService, LedgerService, CostService, ReservationService, InventoryService],
})
export class InventoryModule {}
