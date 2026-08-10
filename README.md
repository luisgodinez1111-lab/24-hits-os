# 24 HITS OS

Plataforma SaaS institucional **multi-tenant, multiusuario y multisucursal**.
Monolito modular. Esta base provee los cimientos (tenancy, auth, RBAC, auditoría,
observabilidad, infraestructura) sobre los que se construirán inventario, ventas,
logística, CRM y analítica.

> Prioridades: **Integridad → Seguridad → Arquitectura → Trazabilidad →
> Mantenibilidad → Rendimiento → Velocidad de desarrollo.**

## Stack

- **Monorepo**: pnpm + Turborepo
- **Frontend**: Next.js (App Router) · React · TypeScript strict · Tailwind ·
  TanStack Query · React Hook Form · Zod
- **Backend**: NestJS · TypeScript strict · REST + OpenAPI
- **Base de datos**: PostgreSQL + **Prisma** (ORM elegido, ver ADR-003)
- **Worker/colas**: BullMQ sobre Redis
- **Almacenamiento**: MinIO (dev) / S3-compatible (prod), archivos privados con URLs firmadas
- **Observabilidad**: OpenTelemetry, logs estructurados, correlation IDs
- **Infra local**: Docker Compose (PostgreSQL, Redis, MinIO)

## Estructura del monorepo

```
24-hits-os/
├── apps/
│   ├── web/          # Next.js (Vercel-ready)
│   ├── api/          # NestJS (monolito modular)
│   └── worker/       # BullMQ worker
├── packages/
│   ├── ui/           # Design system
│   ├── database/     # Prisma schema, cliente, migraciones, seed
│   ├── auth/         # Catálogo de permisos, roles del sistema
│   ├── contracts/    # DTOs/tipos compartidos API↔web (Zod)
│   ├── config/       # Carga y validación de env
│   ├── observability/# OTel, logger, correlation id
│   ├── shared/       # Primitivos: newId (UUID v7), Money, etc.
│   ├── testing/      # Utilidades de test
│   ├── eslint-config/
│   └── typescript-config/
├── infrastructure/
│   ├── docker/       # docker-compose.yml
│   └── scripts/
└── docs/
    ├── architecture/  adr/  database/  security/  operations/  product/
```

## Requisitos

- Node.js 20+ (`.nvmrc`)
- pnpm 9+ (`corepack enable`)
- Docker + Docker Compose

## Puesta en marcha local

```bash
# 1. Dependencias
pnpm install

# 2. Infraestructura (PostgreSQL + Redis + MinIO)
pnpm infra:up

# 3. Variables de entorno
cp .env.example .env

# 4. Base de datos: migraciones + datos de desarrollo
pnpm db:migrate
pnpm db:seed

# 5. Levantar todo (api, web, worker)
pnpm dev
```

Servicios locales:

| Servicio            | URL                     |
|---------------------|-------------------------|
| Web (Next.js)       | http://localhost:3000   |
| API (NestJS)        | http://localhost:4000   |
| API health          | http://localhost:4000/health |
| MinIO consola       | http://localhost:9001   |
| PostgreSQL          | localhost:5432          |
| Redis               | localhost:6379          |

### Credenciales de desarrollo (generadas por el seed)

> Solo desarrollo. **Nunca** usar en producción.

- Organización: **24 HITS** · Sucursal: **Chihuahua** · Almacén: **Almacén Principal**
- Usuario owner: `owner@example.local` · Password: `Owner123!Dev`

## Scripts de raíz

```bash
pnpm dev            # todos los apps en desarrollo
pnpm build          # build de todo el grafo
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # unit + integration
pnpm test:e2e       # end-to-end
pnpm db:migrate     # migraciones (dev)
pnpm db:seed        # seed de desarrollo
pnpm db:studio      # Prisma Studio
pnpm infra:up       # docker compose up -d
pnpm infra:down     # docker compose down
```

## Documentación

- Decisiones: [`docs/adr/`](docs/adr) (ADR-001 … ADR-009)
- Arquitectura: [`docs/architecture/`](docs/architecture)
- Modelo de datos: [`docs/database/data-model.md`](docs/database/data-model.md)
- Seguridad: [`docs/security/security-model.md`](docs/security/security-model.md)
- Operación local: [`docs/operations/local-development.md`](docs/operations/local-development.md)

## Estado de construcción (por fases)

- [x] **Fase 1** — Cimientos: monorepo, tooling, Docker Compose, 9 ADRs, modelo de datos Prisma, primitivos (`Money`, `newId`).
- [x] **Fase 2** — Backend NestJS: auth (Argon2id, sesiones, refresh rotation), tenancy + RLS, RBAC, auditoría, observabilidad, health/ready, rate limiting, Swagger.
- [x] **Fase 3** — Worker BullMQ (`email.send`), Email/Storage providers (Console + S3/MinIO firmado).
- [x] **Fase 4** — Frontend Next.js + design system (`packages/ui`), páginas de auth y panel.
- [x] **Fase 5** — Tests (RBAC unit, Argon2id, RLS/sesión integración) + CI (GitHub Actions) + verificación (lint/typecheck/build/test verdes).

## Testing

```bash
pnpm test              # unitarios (no requieren servicios): 14 tests verdes
pnpm --filter @24hits/database db:deploy       # aplicar migraciones (con Docker arriba)
pnpm --filter @24hits/api test:integration     # integración: RLS/aislamiento + revocación de sesión
```

CI (`.github/workflows/ci.yml`) levanta PostgreSQL + Redis y corre install → lint →
typecheck → build → test → migraciones → tests de integración.
