# Modelo de seguridad

## Principios
Integridad → Seguridad → Trazabilidad. La UI nunca es autoridad de seguridad; el
backend valida siempre. Defensa en profundidad para el aislamiento entre tenants.

## Autenticación y sesiones
- Contraseñas: **Argon2id** (memory-hard). Nunca en texto plano ni logs.
- Refresh tokens: opacos, guardados solo como **hash SHA-256**; rotados en cada uso.
- Access tokens JWT cortos; el estado de sesión se valida en cada request → revocación
  y desactivación de usuario **inmediatas**.
- Cookies `httpOnly` + `Secure` (prod) + `SameSite=Lax`; el refresh no es accesible por JS.

## Autorización
- RBAC por permisos centralizado (`@RequirePermissions` + `PermissionsGuard`).
- Sin checks de rol dispersos (`if role === 'admin'`) en el código.

## Aislamiento de tenants
- `organization_id` en toda tabla operativa; acceso vía `withTenant` (RLS).
- **RLS** con `FORCE` en tablas operativas; bypass explícito y acotado para sistema.
- **No-enumeración**: recursos de otro tenant → 404 (no confirmar existencia).

## Superficie de entrada
- **Validación**: todo input con **Zod** (`ZodValidationPipe`). No se confía en TS en runtime.
- **Rate limiting** (Redis) en login, registro y recuperación.
- **Helmet** (cabeceras), **CORS** restringido a `APP_URL` con credenciales.

## Manejo de errores
Formato estándar `{ error: { code, message, details }, correlationId }`. Los 5xx se
registran server-side con stack pero al cliente solo se le devuelve un mensaje genérico:
**nunca** stack traces, SQL ni detalles internos.

## Auditoría
- `AuditEvent` **append-only**: no hay endpoints de update/delete; la interfaz no puede
  modificar la auditoría. Lectura protegida por `audit.read`.
- Cada evento lleva actor, sesión, IP, user-agent, `correlationId` y (cuando aplica)
  `before`/`after`. Ejemplos: `auth.login.success/failure`, `organization.created`,
  `branch.updated`, `auth.password_reset`.

## Correlation ID
Cada request genera o propaga `X-Correlation-ID`, presente en logs, errores, auditoría
y jobs encolados → trazabilidad de una operación de punta a punta.

## Secretos y configuración
- Variables validadas con Zod al arrancar (`@24hits/config`). Faltante crítico → el
  proceso no arranca.
- Ningún secreto hardcodeado ni commiteado. `.env` gitignoreado.

## Pendiente (hardening futuro)
- Detección de reuso de refresh por familia (el modelo ya guarda `familyId`).
- 2FA TOTP (modelo preparado).
- Cifrado en reposo de `totpSecret`.
- Rol de BD sin privilegios de propietario para reforzar RLS sin depender de `FORCE`.
