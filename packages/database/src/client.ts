import { PrismaClient } from "@prisma/client";
import { newId } from "@24hits/shared";

// Inyecta un UUID v7 en `id` si el caller no lo proporcionó (ADR-007).
// Justificación de `any`: los tipos de `data` de Prisma son uniones muy amplias por
// modelo; aquí solo tocamos la propiedad `id` de forma segura y acotada.
function injectId(data: unknown): void {
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as { id?: unknown }).id == null
  ) {
    (data as { id?: string }).id = newId();
  }
}

// Tablas puente con PK compuesta (sin campo `id`): NO se les debe inyectar `id`.
const NO_ID_MODELS = new Set(["RolePermission", "MembershipRole", "MembershipBranch"]);

// Crea el cliente Prisma extendido: auto-id (UUID v7) en create/createMany/upsert,
// salvo en modelos con clave primaria compuesta.
export function createPrismaClient(datasourceUrl?: string) {
  const base = new PrismaClient(
    datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : undefined
  );

  return base.$extends({
    name: "auto-uuidv7",
    query: {
      $allModels: {
        create({ model, args, query }) {
          if (!NO_ID_MODELS.has(model)) injectId(args.data);
          return query(args);
        },
        upsert({ model, args, query }) {
          if (!NO_ID_MODELS.has(model)) injectId(args.create);
          return query(args);
        },
        createMany({ model, args, query }) {
          if (!NO_ID_MODELS.has(model)) {
            const data = args.data;
            if (Array.isArray(data)) data.forEach(injectId);
            else injectId(data);
          }
          return query(args);
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

// Cliente disponible dentro de una transacción de tenant (sin métodos de gestión
// de conexión ni de transacción anidada).
export type TenantTx = Omit<
  ExtendedPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

// Ejecuta `fn` dentro de una transacción con el contexto de tenant fijado.
// `set_config(..., true)` deja la variable local a la transacción; las políticas RLS
// filtran por `current_setting('app.current_org_id')`. Última red de seguridad de
// aislamiento (ADR-004). El parámetro se enlaza de forma segura (no hay SQL injection).
export async function withTenant<T>(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx as unknown as TenantTx);
  });
}

// Ejecuta `fn` en una transacción con RLS "bypass" activado. SOLO para operaciones
// de sistema que crean/leen datos de varios tenants o preexistentes al contexto:
// bootstrap de organización, seed. Nunca exponer esto a rutas de usuario. (ADR-004)
export async function withSystem<T>(
  prisma: ExtendedPrismaClient,
  fn: (tx: TenantTx) => Promise<T>
): Promise<T> {
  // Operaciones de sistema (bootstrap de organización, seed) pueden encadenar varios
  // pasos contra una BD remota (p.ej. Neon en otra región). Damos margen sobre el
  // timeout por defecto (5s) de las transacciones interactivas de Prisma.
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx as unknown as TenantTx);
    },
    { timeout: 30_000, maxWait: 10_000 }
  );
}
