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
  private readonly nodeEnv: Env["NODE_ENV"];

  constructor(@Inject(ENV) env: Env) {
    this.client = createPrismaClient(env.DATABASE_URL);
    this.nodeEnv = env.NODE_ENV;
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    await this.assertRlsEnforceable();
  }

  // Blindaje de arranque (defensa en profundidad del aislamiento multi-tenant):
  // en producción, si el rol de conexión puede SALTARSE RLS —es superusuario o tiene
  // el atributo BYPASSRLS— o si las tablas no tienen FORCE ROW LEVEL SECURITY aplicado,
  // el proceso muere en vez de arrancar sirviendo datos de todos los tenants en
  // silencio. Convierte "en Neon seguro es no-superusuario" en una garantía probada
  // en cada boot. Ver ADR-004 (RLS por current_setting('app.current_org_id')).
  private async assertRlsEnforceable(): Promise<void> {
    if (this.nodeEnv !== "production") return;

    const [role] = await this.client.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    if (!role) {
      throw new Error("[RLS] No se pudo determinar el rol de conexión (pg_roles).");
    }
    if (role.rolsuper || role.rolbypassrls) {
      throw new Error(
        "[RLS] El rol de conexión de la BD puede saltarse Row-Level Security " +
          `(superuser=${role.rolsuper}, bypassrls=${role.rolbypassrls}). ` +
          "Usa un rol de aplicación NOSUPERUSER NOBYPASSRLS en producción."
      );
    }

    const [forced] = await this.client.$queryRaw<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM pg_class WHERE relforcerowsecurity`;
    if (!forced || forced.n === 0) {
      throw new Error(
        "[RLS] Ninguna tabla tiene FORCE ROW LEVEL SECURITY aplicado. " +
          "Verifica que las migraciones de RLS corrieron en esta base."
      );
    }
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
