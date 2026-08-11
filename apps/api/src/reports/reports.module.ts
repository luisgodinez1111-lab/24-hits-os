import { Module } from "@nestjs/common";
import { IamModule } from "../iam/iam.module.js";
import { ReportsService } from "./reports.service.js";
import { ReportsController } from "./reports.controller.js";

@Module({
  imports: [IamModule], // PermissionService para filtrar utilidad/costo en el backend
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
