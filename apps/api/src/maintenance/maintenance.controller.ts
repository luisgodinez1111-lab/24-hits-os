import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Env } from "@24hits/config";
import { reconcileOrphanOrderHolds } from "@24hits/database";
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

    // Red de seguridad: libera holds de inventario huérfanos (ver ADR/reconcile).
    const orphanHolds = await reconcileOrphanOrderHolds(this.prisma.client);

    return {
      ok: true,
      ranAt: new Date().toISOString(),
      orphanHoldsReleased: orphanHolds.length,
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
