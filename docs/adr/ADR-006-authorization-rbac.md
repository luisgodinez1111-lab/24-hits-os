# ADR-006 — Autorización / RBAC

## Status
Aceptada — 2026-08-09

## Context
La autorización dispersa (`if (user.role === 'admin')` repartido por el código) es
insegura y no auditable. Necesitamos permisos **granulares**, centralizados, evaluados
en el backend, y con roles que varían por organización (multi-tenant). La UI puede
ocultar opciones, pero **nunca** es la autoridad de seguridad.

## Decision
**RBAC basado en permisos, centralizado.**

Modelo:
```
Permission            (clave estable, p.ej. "users.manage")
Role                  (por organización o del sistema)
RolePermission        (Role N:M Permission)
OrganizationMembership(pertenencia usuario↔organización)
MembershipRole        (Membership N:M Role)
```
- Los **permisos** son la unidad atómica (`recurso.acción`): `users.manage`,
  `branches.create`, `inventory.adjust`, `audit.read`, etc. Catálogo versionado en
  `packages/auth`.
- Los **roles** agrupan permisos. Roles del sistema (plantillas) + roles propios por
  organización.
- La autorización efectiva de una request = unión de permisos de los roles de la
  membresía activa, resuelta server-side y cacheada en Redis por `membershipId`.
- **Punto de decisión único (PDP)**: un `PermissionService.can(ctx, 'users.manage')`.
  Se expone como decorator/guard NestJS: `@RequirePermissions('users.manage')`.
- El guard corre **después** del tenant middleware, de modo que evalúa contra el
  `TenantContext` correcto.

## Alternatives
- **RBAC por rol simple (sin permisos)**: rechazado; inflexible y lleva a checks de rol
  dispersos.
- **ABAC/políticas (OPA, CASL como motor central)**: potente pero excesivo hoy. El
  modelo permite evolucionar a condiciones por atributo más adelante (p.ej. límites por
  branch) sin rehacer la base.

## Consequences
- (+) Permisos finos y auditables; cambiar un permiso de un rol afecta a todos sus
  miembros de forma consistente.
- (+) Un solo lugar decide (PDP); la UI solo consume el mapa de permisos para ocultar.
- (+) Roles por organización habilitan personalización SaaS.
- (−) Hay que mantener el catálogo de permisos y los seeds de roles; se versiona y prueba.
- (−) Caché de permisos requiere invalidación al cambiar roles; se invalida por
  `membershipId` en cada mutación de rol.
