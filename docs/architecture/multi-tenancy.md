# Multi-tenancy

Modelo: **shared database / shared schema** con `organization_id` en cada fila
operativa + membresías N:M + defensa en profundidad (ADR-004).

## Jerarquía
```
Platform → Organization → Branch → Warehouse
```
Un `User` es global. La pertenencia es `OrganizationMembership (userId, organizationId)`;
un usuario puede pertenecer a varias organizaciones. Los roles se asignan a la
membresía (`MembershipRole`), no al usuario.

## TenantContext
Se construye en el pipeline de la request y viaja por `AsyncLocalStorage`
(`RequestContext`):
```
{ correlationId, ip, userAgent, auth: { userId, sessionId, organizationId, membershipId } }
```
- El middleware `RequestContextMiddleware` fija correlationId/ip/userAgent.
- El `JwtAuthGuard` publica `auth` tras validar el access token (que lleva `org` y `mbr`).

## Defensa en profundidad (capas)
1. **Authentication** — el access token identifica usuario+sesión; se valida el estado
   de la sesión en cada request (revocación inmediata).
2. **Tenant middleware / contexto** — `organizationId` activo disponible en todo el request.
3. **Guards** — `PermissionsGuard` exige org activa para endpoints con permisos.
4. **Service layer** — los servicios operan siempre con el `organizationId` del contexto.
5. **Repository filters** — el acceso a datos tenant pasa por `prisma.withTenant(orgId, …)`.
6. **PostgreSQL RLS** — política `tenant_isolation` en tablas operativas (Branch,
   Warehouse, OrganizationSettings, FeatureFlag). Última red: aunque la app tuviera un
   bug de filtro, la BD no devuelve filas de otra organización.

## Cómo funciona RLS aquí
`withTenant(orgId, fn)` abre una transacción y ejecuta
`set_config('app.current_org_id', orgId, true)`. Las políticas comparan
`"organizationId" = current_setting('app.current_org_id')`. Con `FORCE ROW LEVEL
SECURITY`, aplica incluso al rol dueño.

Operaciones de sistema que preceden al contexto de tenant (bootstrap de organización,
seed) usan `withSystem(fn)` → `set_config('app.bypass_rls','on',true)`, contemplado en
las políticas. Este bypass **no** se expone a rutas de usuario.

Las tablas estructurales de IAM (Role, Membership, …) e identidad NO llevan RLS: el
resolutor de permisos y los flujos de auth requieren lecturas cruzadas, y se protegen
en la capa de aplicación.

## No-enumeración
Un recurso de otra organización se comporta como inexistente: se devuelve **404**, no
403, para no confirmar su existencia a un tenant no autorizado (ver `BranchService`).

## Aislamiento probado
La prueba crítica (Fase 5): con contexto de Org A, intentar leer un `Branch` de Org B
por su UUID debe devolver 404. Ver `apps/api` tests de integración.
