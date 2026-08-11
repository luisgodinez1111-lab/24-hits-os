import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { AppException } from "../common/errors/app-exception.js";
import { NotificationService } from "./notification.service.js";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  // Lectura/estado: cualquier usuario autenticado con organización activa.
  private requireOrg(u: AuthContext): string {
    if (!u.organizationId) throw AppException.forbidden("Selecciona una organización para continuar");
    return u.organizationId;
  }

  @Get()
  list(@CurrentUser() u: AuthContext) {
    return this.notifications.list(this.requireOrg(u), u.userId);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() u: AuthContext) {
    return this.notifications.unreadCount(this.requireOrg(u), u.userId);
  }

  @Post(":id/read")
  markRead(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.notifications.markRead(this.requireOrg(u), u.userId, id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() u: AuthContext) {
    return this.notifications.markAllRead(this.requireOrg(u), u.userId);
  }

  // Escaneo de stock bajo bajo demanda (además del cron del worker).
  @Post("scan-low-stock")
  @RequirePermissions("inventory.read")
  scanLowStock(@CurrentUser() u: AuthContext) {
    return this.notifications.scanLowStock(this.requireOrg(u));
  }
}
