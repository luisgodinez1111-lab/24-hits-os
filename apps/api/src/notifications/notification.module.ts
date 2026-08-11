import { Module } from "@nestjs/common";
import { NotificationService } from "./notification.service.js";
import { NotificationController } from "./notification.controller.js";

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
