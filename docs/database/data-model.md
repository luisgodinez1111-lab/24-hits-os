# Modelo de datos

Fuente de verdad: [`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma).
IDs: **UUID v7** generados en la app (ADR-007). Dinero: value object `Money`
(ADR-008). Todas las tablas operativas llevan `organizationId` (ADR-004).

## Identidad (global)
- **User** — persona. Global, no ligado a una sola organización. Campos: email,
  passwordHash (Argon2id), status (ACTIVE/DISABLED), emailVerifiedAt, `totpSecret` +
  `totpEnabledAt` (2FA preparado).
- **EmailVerificationToken / PasswordResetToken** — se guarda solo el `tokenHash`
  (SHA-256), con `expiresAt` y `consumedAt`.
- **Session** — sesión con estado (ADR-005): `refreshTokenHash` (SHA-256), `familyId`
  (rotación con detección de reuso), `organizationId` (contexto activo), ip, userAgent,
  device, lastUsedAt, expiresAt, revokedAt.

## Tenancy
```
Organization 1───N Branch 1───N Warehouse
Organization 1───N OrganizationMembership N───1 User
Organization 1───1 OrganizationSettings
Organization 1───N FeatureFlag
```
- **Organization** — name, slug, legalName?, timezone (`America/Chihuahua`), currency
  (`MXN`), status (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED).
- **OrganizationSettings** — configuración de negocio (no constantes):
  `negativeInventoryAllowed=false` por defecto, defaultPaymentCommission,
  deliveryCutoffTime, orderNumberPrefix.
- **FeatureFlag** — `key`+`enabled` por organización (wholesale.enabled, crm.enabled, …).
- **Branch** — organizationId, name, code (único por org), timezone?, phone?, address,
  lat/long (Decimal), status. **code único por organización**.
- **Warehouse** — pertenece a una Branch; `type` MAIN/COUNTER/DELIVERY (una sucursal
  tiene varios almacenes). Lleva `organizationId` desnormalizado para RLS.

## Membresías y alcance
- **OrganizationMembership** — pertenencia N:M usuario↔organización, con status
  (INVITED/ACTIVE/SUSPENDED). Único por (userId, organizationId).
- **MembershipBranch** — limita a qué sucursales accede una membresía.

## RBAC
```
Permission N───N Role  (RolePermission)
Role       N───N OrganizationMembership  (MembershipRole)
```
- **Permission** — `key` global "recurso.acción" (users.manage, inventory.adjust, …).
- **Role** — `organizationId` null = plantilla del sistema; con valor = rol de la org.
  Único por (organizationId, key).
- **RolePermission / MembershipRole** — tablas puente.

## Auditoría
- **AuditEvent** — append-only: organizationId?, actorUserId?, sessionId?, branchId?,
  action, entityType?, entityId?, before?, after?, metadata?, ipAddress?, userAgent?,
  correlationId?, createdAt. Índices por (organizationId, createdAt), action,
  correlationId, (entityType, entityId).

## Row Level Security
RLS se define en una migración SQL dedicada (Prisma no la modela de forma
declarativa). Cada tabla con `organization_id` tendrá una política que filtra por
`current_setting('app.current_org_id')`, fijado por transacción con `SET LOCAL`.
Detalle en `docs/architecture/multi-tenancy.md` (Fase 2).

## Índices y unicidad clave
- `User.email` único · `Organization.slug` único.
- `Branch (organizationId, code)` único · `Warehouse (branchId, code)` único.
- `OrganizationMembership (userId, organizationId)` único.
- `Session.refreshTokenHash` único · tokens de verificación/reset con `tokenHash` único.
