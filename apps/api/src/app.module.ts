import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AppConfigModule } from "./config/app-config.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { EmailModule } from "./email/email.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { IamModule } from "./iam/iam.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { TransfersModule } from "./transfers/transfers.module.js";
import { StockCountsModule } from "./stock-counts/stock-counts.module.js";
import { PricingModule } from "./pricing/pricing.module.js";
import { SuppliersModule } from "./suppliers/suppliers.module.js";
import { PurchasingModule } from "./purchasing/purchasing.module.js";
import { SalesModule } from "./sales/sales.module.js";
import { CashModule } from "./cash/cash.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { NotificationModule } from "./notifications/notification.module.js";
import { HealthModule } from "./health/health.module.js";
import { RequestContextMiddleware } from "./common/middleware/request-context.middleware.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { RateLimitGuard } from "./common/guards/rate-limit.guard.js";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "./common/guards/permissions.guard.js";

@Module({
  imports: [
    AppConfigModule,
    ObservabilityModule,
    RedisModule,
    PrismaModule,
    QueueModule,
    EmailModule,
    StorageModule,
    AuditModule,
    IamModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    TransfersModule,
    StockCountsModule,
    PricingModule,
    SuppliersModule,
    PurchasingModule,
    SalesModule,
    CashModule,
    ReportsModule,
    NotificationModule,
    HealthModule,
  ],
  providers: [
    // Filtro de errores global (formato estándar).
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Orden de guards: rate limit → autenticación → autorización.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Correlation ID + contexto de request en TODAS las rutas.
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
