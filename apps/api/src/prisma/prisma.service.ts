import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Env } from "@24hits/config";
import {
  createPrismaClient,
  withSystem,
  withTenant,
  type ExtendedPrismaClient,
  type TenantTx,
} from "@24hits/database";
import { ENV } from "../config/app-config.module.js";

// Dueño del cliente Prisma. Expone `client` (sin tenant) para tablas globales
// (usuarios, sesiones, tokens) y `withTenant()` para operaciones tenant-scoped
// (RLS + filtro por organización).
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  public readonly client: ExtendedPrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient(env.DATABASE_URL);
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  // Ejecuta trabajo dentro del contexto de tenant (transacción con RLS activada).
  withTenant<T>(organizationId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.client, organizationId, fn);
  }

  // Ejecuta trabajo de sistema con RLS bypass (bootstrap/seed). Uso restringido.
  withSystem<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withSystem(this.client, fn);
  }
}
