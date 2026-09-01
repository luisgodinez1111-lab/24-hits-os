import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Env } from "@24hits/config";
import {
  detectInventoryDrift,
  expireDueReservations,
  notifyInventoryDrift,
  reconcileOrphanOrderHolds,
  scanLowStockAllOrgs,
} from "@24hits/database";
import { ENV } from "../config/app-config.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Public } from "../common/decorators/public.decorator.js";
import { AppException } from "../common/errors/app-exception.js";

// Endpoint de mantenimiento disparado por un cron GRATIS (Vercel Cron / GitHub
// Actions), no por un usuario. Corre las redes de seguridad de inventario que antes
// dependían de un worker persistente (que requiere hosting de pago). Protegido con un
// secreto compartido: Vercel Cron envía `Authorization: Bearer $CRON_SECRET`
// automáticamente cuando la variable CRON_SECRET está definida.
@ApiTags("maintenance")
@Controller("internal/maintenance")
export class MaintenanceController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env
  ) {}

  @Public()
  @Get("run")
  async run(@Headers("authorization") authorization?: string) {
    this.assertSecret(authorization);
    const prisma = this.prisma.client;

    // Las 4 redes de seguridad de inventario (cross-tenant). Cada una es idempotente;
    // se corren en secuencia y se reporta el resumen. Un fallo en una no se traga:
    // propaga y el cron marca la corrida como fallida (visible en Vercel).
    const orphanHolds = await reconcileOrphanOrderHolds(prisma);
    const expiredReservations = await expireDueReservations(prisma);
    const lowStockNotifications = await scanLowStockAllOrgs(prisma);
    const drift = await detectInventoryDrift(prisma);
    // El descuadre de inventario no se queda como número: se alerta al dueño (in-app).
    const driftAlerts = await notifyInventoryDrift(prisma, drift);

    return {
      ok: true,
      ranAt: new Date().toISOString(),
      orphanHoldsReleased: orphanHolds.length,
      expiredReservations,
      lowStockNotifications,
      inventoryDrift: drift.length, // >0 = inconsistencias proyección↔ledger a revisar
      driftAlerts, // notificaciones CRÍTICAS creadas por descuadre
    };
  }

  // Verifica el secreto compartido. Sin CRON_SECRET configurado, el endpoint queda
  // deshabilitado (no expone mantenimiento por accidente).
  private assertSecret(authorization?: string): void {
    const secret = this.env.CRON_SECRET;
    if (!secret) {
      throw AppException.forbidden("Mantenimiento deshabilitado: falta CRON_SECRET.");
    }
    if (authorization !== `Bearer ${secret}`) {
      throw AppException.forbidden();
    }
  }
}
