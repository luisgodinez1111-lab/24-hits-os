# Visión general del sistema

## Qué es
24 HITS OS es una plataforma SaaS institucional multi-tenant. Un **monolito modular**
(ADR-002) desplegado como API + worker, con un frontend Next.js, respaldado por
PostgreSQL, Redis y almacenamiento S3-compatible.

## Componentes

```
                    ┌─────────────┐
   navegador  ───▶  │  web (Next) │  ── HTTP/JSON ──▶ ┌──────────────┐
                    └─────────────┘                    │  api (Nest)  │
                                                        │  monolito    │
                                     encola jobs  ◀───  │  modular     │
                    ┌─────────────┐   (BullMQ)          └──────┬───────┘
                    │ worker      │  ◀── Redis ────────────────┤
                    │ (BullMQ)    │                            │
                    └─────────────┘                            │
                                                               ▼
              ┌───────────┐   ┌──────────┐   ┌──────────────────────┐
              │ PostgreSQL│   │  Redis   │   │ MinIO / S3 (privado) │
              └───────────┘   └──────────┘   └──────────────────────┘
```

- **api** (`apps/api`, NestJS): expone `/api/v1`, contiene los módulos de dominio
  (`auth`, `iam`, `audit`, …). Autoridad de seguridad (authN/authZ). Publica jobs.
- **worker** (`apps/worker`): consume colas BullMQ (emails, reportes, mantenimiento).
- **web** (`apps/web`, Next.js): UI. Nunca es autoridad de seguridad; solo consume la API.
- **PostgreSQL**: fuente de verdad. Multi-tenant con `organization_id` + RLS.
- **Redis**: colas, rate limiting, cache, locks distribuidos (futuro).
- **MinIO/S3**: archivos privados con URLs firmadas.

## Módulos del backend (fronteras)
- `config` — carga y validación de entorno.
- `observability` — logger estructurado, correlation id, OpenTelemetry, health/ready.
- `database` — Prisma + TenantContext + RLS.
- `auth` — registro, verificación, login/logout, refresh, sesiones, recuperación.
- `iam` — organizaciones, membresías, sucursales, almacenes, roles, permisos.
- `audit` — registro append-only de eventos.

Regla: sin dependencias circulares entre módulos; los contratos compartidos viven en
`packages/contracts`.

## Flujo de una request (resumido)
1. Entra la request → se asigna/lee `X-Correlation-ID`.
2. AuthN: valida access token → identifica usuario y sesión.
3. Tenant middleware: construye `TenantContext` (organización activa, membership, branches).
4. Guards: `@RequirePermissions(...)` evalúa contra el contexto.
5. Servicio de dominio: lógica + repositorios con filtro `organization_id`.
6. Base de datos: RLS como última red de seguridad (transacción con `SET LOCAL`).
7. Respuesta con formato estándar; errores sin filtrar detalles internos.

Ver documentos específicos: multi-tenancy, authentication, authorization, security-model.
