import { Module } from "@nestjs/common";
import { MaintenanceController } from "./maintenance.controller.js";

// PrismaService (PrismaModule) y ENV (AppConfigModule) son @Global → no hace falta
// importarlos aquí.
@Module({
  controllers: [MaintenanceController],
})
export class MaintenanceModule {}
