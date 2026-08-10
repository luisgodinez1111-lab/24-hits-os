# ADR-005 — Estrategia de autenticación

## Status
Aceptada — 2026-08-09

## Context
Necesitamos autenticación segura y **revocable**: cerrar una sesión específica,
cerrar todas, ver dispositivos activos, desactivar un usuario de inmediato. Un JWT
puramente stateless no permite revocación fina. También debemos soportar registro con
verificación de correo, recuperación de contraseña y, a futuro, TOTP (2FA).

## Decision
**Access token JWT de vida corta + refresh token opaco con estado en base de datos.**

- **Password hashing**: **Argon2id** (memory-hard) con parámetros seguros por defecto.
- **Access token**: JWT firmado (HS256 con `JWT_ACCESS_SECRET`), TTL ~15 min. Lleva
  `sub` (userId), `sid` (sessionId), `org` (organizationId activo), `mbr` (membershipId).
  Sin permisos embebidos voluminosos: los permisos se resuelven server-side/cachean en Redis.
- **Refresh token**: cadena aleatoria de alta entropía (opaca, no JWT). En la base se
  guarda **solo su hash SHA-256** (el token es de alta entropía, no requiere Argon2 y el
  hash permite lookup indexado). TTL ~30 días.
- **Rotación**: cada refresh emite un token nuevo e invalida el anterior
  (rotación con detección de reuso → si se reusa un token rotado, se revoca la familia).
- **Sesiones con estado**: tabla `Session` (id, userId, organizationId, refreshTokenHash,
  ip, userAgent, device, createdAt, lastUsedAt, expiresAt, revokedAt). Revocar =
  `revokedAt`. Desactivar usuario = revocar todas sus sesiones.
- **Transporte**: cookies `httpOnly`, `Secure`, `SameSite=Lax` para web; el refresh
  nunca es accesible por JS. (Bearer disponible para clientes no-navegador.)
- **2FA (TOTP)**: el modelo `User` incluye `totpSecret` (nullable, cifrado) y
  `totpEnabledAt`; el flujo de login contempla un paso intermedio. La UI completa de 2FA
  se difiere, pero el esquema y el flujo ya lo permiten sin migración disruptiva.

## Alternatives
- **JWT stateless puro**: descartado; no permite revocación inmediata ni gestión de
  dispositivos.
- **Sesiones server-side clásicas (cookie→store)**: válidas, pero el access JWT corto
  reduce lecturas al store en cada request y facilita clientes API.
- **bcrypt**: aceptable, pero Argon2id es el estándar recomendado actual (resistencia a
  GPU/ASIC).

## Consequences
- (+) Revocación real, gestión de dispositivos y desactivación inmediata.
- (+) Access corto limita la ventana de un token filtrado; refresh rotado detecta robo.
- (+) Preparado para 2FA sin rediseño.
- (−) Estado de sesión en BD/Redis (más piezas que stateless puro); se acota con TTLs y
  limpieza de sesiones expiradas por el worker.
- (−) La rotación con detección de reuso exige cuidado transaccional; se centraliza en el
  servicio de auth y se cubre con tests.
