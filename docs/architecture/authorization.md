# Autorización (RBAC)

RBAC **basado en permisos, centralizado** (ADR-006). La UI puede ocultar opciones,
pero la autoridad de seguridad es el backend.

## Modelo
```
Permission  ── RolePermission ──  Role  ── MembershipRole ──  OrganizationMembership
```
- **Permission**: unidad atómica `recurso.acción` (catálogo en `packages/auth`).
- **Role**: agrupa permisos. `organizationId = null` → plantilla del sistema;
  con valor → rol propio de la organización.
- La autorización efectiva de una request = unión de permisos de los roles de la
  **membresía activa**.

## Punto de decisión (PDP)
`PermissionService.can(membershipId, requiredKeys[])`:
- Resuelve permisos vía `MembershipRole → Role → RolePermission → Permission`.
- Cachea el conjunto en Redis (`perm:membership:<id>`, TTL 300s).
- Se invalida (`invalidate`) al cambiar los roles de una membresía.

## Uso
```ts
@RequirePermissions('users.manage')
@Post()
manageUser() { ... }
```
El `PermissionsGuard` (global, tras autenticación) lee la metadata, exige org+membresía
activas y evalúa contra el PDP. Sin el permiso → **403 FORBIDDEN**.

## Catálogo de permisos
`organization.manage` · `users.{read,invite,manage}` · `roles.{read,manage}` ·
`branches.{read,create,update}` · `warehouses.{read,create,update}` ·
`products.{read,manage}` · `inventory.{read,adjust}` · `orders.{read,create,cancel}` ·
`finance.read` · `profits.read` · `audit.read`.

## Roles del sistema (seed)
Organization Owner (todos), Organization Admin (todos salvo `organization.manage`),
Operations Manager, Branch Manager, Warehouse Manager, Warehouse Operator, Sales Agent,
Wholesale Executive, Cashier, Driver, Finance, Auditor, Read Only. Definidos en
`packages/auth/src/roles.ts`; los permisos reales se resuelven desde ahí.

## Prueba (Fase 5)
Un **Warehouse Operator** NO tiene `users.manage` → un endpoint con ese permiso debe
responder 403.
