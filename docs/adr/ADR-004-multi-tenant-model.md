# ADR-004 — Modelo multi-tenant

## Status
Aceptada — 2026-08-09

## Context
La plataforma es SaaS multiempresa con jerarquía
`Platform → Organization → Branch → Warehouse`. Un usuario debe poder pertenecer a
**más de una organización** en el futuro (agencias, contadores, operadores
multi-marca), por lo que `user.organizationId` como campo único es inaceptable.
Además, el aislamiento entre tenants es un requisito de seguridad crítico: la
Organización A jamás debe leer datos de la B, ni siquiera conociendo sus UUID.

## Decision
**Tenancy compartido (shared database, shared schema) con `organization_id` en cada
fila operativa**, más membresías N:M y defensa en profundidad.

1. **Identidad vs. pertenencia**: `User` es global (una persona). La pertenencia se
   modela con `OrganizationMembership (userId, organizationId, status)`. Un usuario
   puede tener varias membresías.
2. **Roles por membresía**: los roles se asignan a la **membresía**, no al usuario
   global, vía `MembershipRole`. Así el rol es específico de la organización.
3. **Alcance de sucursales**: `MembershipBranch` limita a qué `Branch` accede una
   membresía (acceso total si no hay restricciones, según política del rol).
4. **Columnas de tenant**: toda tabla operativa lleva `organization_id`; cuando
   aplica, además `branch_id` y `warehouse_id`.
5. **TenantContext**: un objeto `{ organizationId, membershipId, userId, branchIds,
   permissions }` se construye en middleware y viaja por toda la request (AsyncLocalStorage).
6. **Defensa en profundidad** (6 capas): authentication → tenant middleware → guards
   → service layer → repository filters (`organization_id` siempre) → **PostgreSQL RLS**.
7. **Política de no-enumeración**: un recurso de otro tenant devuelve **404** (no 403),
   para no confirmar su existencia a un tenant no autorizado.

## Alternatives
- **Base/esquema por tenant**: mayor aislamiento físico pero costo operativo alto
  (migraciones × N, provisioning) y complica reporting cross-tenant interno.
  Rechazado para esta escala; el modelo elegido puede migrar a esto si un cliente
  enterprise lo exige.
- **`user.organizationId` simple**: rechazado; impide multi-organización y mezcla
  identidad con pertenencia.

## Consequences
- (+) Un usuario puede pertenecer a varias organizaciones sin duplicar identidad.
- (+) Aislamiento con múltiples redes de seguridad; RLS protege incluso ante un bug
  de aplicación.
- (+) Reporting interno simple (una sola base).
- (−) Cada tabla operativa debe recordar `organization_id` y sus índices; se centraliza
  con helpers de repositorio y RLS obligatoria.
- (−) Riesgo de "olvidar el filtro": mitigado por RLS + revisión + tests de aislamiento
  automatizados (criterio de aceptación de la fase).
