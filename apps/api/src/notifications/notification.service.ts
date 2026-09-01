import { Injectable } from "@nestjs/common";
import { Prisma, scanLowStockForOrg } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // Filtro base: las notificaciones del usuario + las de difusión (recipient nulo).
  private mineOrBroadcast(userId: string): Prisma.NotificationWhereInput {
    return { OR: [{ recipientUserId: userId }, { recipientUserId: null }] };
  }

  list(organizationId: string, userId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.notification.findMany({
        where: this.mineOrBroadcast(userId),
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    );
  }

  async unreadCount(organizationId: string, userId: string): Promise<{ count: number }> {
    const count = await this.prisma.withTenant(organizationId, (tx) =>
      tx.notification.count({ where: { ...this.mineOrBroadcast(userId), readAt: null } })
    );
    return { count };
  }

  async markRead(organizationId: string, userId: string, id: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const n = await tx.notification.findFirst({ where: { id, ...this.mineOrBroadcast(userId) } });
      if (!n) throw new AppException(404, ErrorCode.NOTIFICATION_NOT_FOUND, "Notificación no encontrada");
      if (n.readAt) return n;
      return tx.notification.update({ where: { id }, data: { readAt: new Date() } });
    });
  }

  async markAllRead(organizationId: string, userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.withTenant(organizationId, (tx) =>
      tx.notification.updateMany({
        where: { ...this.mineOrBroadcast(userId), readAt: null },
        data: { readAt: new Date() },
      })
    );
    return { updated: res.count };
  }

  // Resumen de SALUD del negocio para el dashboard: alertas críticas sin resolver
  // (sin leer) de las reconciliaciones — descuadres de inventario, pagos y caja.
  // Las genera el cron/cierre de caja; aquí solo se cuentan para destacarlas.
  async healthSummary(
    organizationId: string,
    userId: string
  ): Promise<{ inventoryDrift: number; paymentDrift: number; cashDiscrepancy: number; total: number }> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const base = { ...this.mineOrBroadcast(userId), readAt: null };
      const [inventoryDrift, paymentDrift, cashDiscrepancy] = await Promise.all([
        tx.notification.count({ where: { ...base, type: "INVENTORY_DRIFT" } }),
        tx.notification.count({ where: { ...base, type: "SYSTEM", dedupeKey: "payment-drift" } }),
        tx.notification.count({ where: { ...base, type: "SYSTEM", dedupeKey: { startsWith: "cash-diff:" } } }),
      ]);
      return {
        inventoryDrift,
        paymentDrift,
        cashDiscrepancy,
        total: inventoryDrift + paymentDrift + cashDiscrepancy,
      };
    });
  }

  // Escaneo de stock bajo bajo demanda (el worker lo corre por cron). Reutiliza la
  // lógica compartida de @24hits/database (ADR-026).
  async scanLowStock(organizationId: string): Promise<{ created: number }> {
    const created = await this.prisma.withTenant(organizationId, (tx) => scanLowStockForOrg(tx, organizationId));
    return { created };
  }
}
