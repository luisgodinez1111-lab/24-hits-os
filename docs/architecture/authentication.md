# Autenticación

Estrategia: **access token JWT corto + refresh token opaco con estado** (ADR-005).
Contraseñas con **Argon2id**. Sesiones revocables.

## Piezas
- `PasswordService` — hash/verify con Argon2id.
- `TokenService` — firma access JWT; genera refresh opaco (48 bytes) y su hash SHA-256.
- `SessionService` — crea/rota/revoca sesiones; lista dispositivos activos.
- `JwtStrategy` — valida el access token **y** el estado de sesión/usuario en cada request.
- `AuthService` — orquesta los flujos; `AuthController` expone HTTP + cookies httpOnly.

## Tokens
- **Access**: JWT HS256, TTL `JWT_ACCESS_TTL` (~15 min). Payload: `sub` (userId),
  `sid` (sessionId), `org` (organizationId activo), `mbr` (membershipId).
- **Refresh**: cadena aleatoria opaca, TTL `JWT_REFRESH_TTL` (~30 días). En BD solo su
  **hash SHA-256** (`Session.refreshTokenHash`). Rotación en cada `/auth/refresh`.
- Transporte web: cookies `httpOnly`, `Secure` (en prod), `SameSite=Lax`. También se
  aceptan Bearer para clientes API.

## Revocación inmediata
El `JwtStrategy.validate` consulta la `Session` en cada request: si está revocada,
expirada, o el usuario no está `ACTIVE`, responde 401 aunque el JWT siga vigente. Así:
- Cerrar una sesión (`DELETE /auth/sessions/:id`) surte efecto al instante.
- `POST /auth/logout-all` revoca todas.
- Desactivar un usuario (status `DISABLED`) lo bloquea de inmediato.

## Flujos (`/api/v1/auth`)
| Endpoint | Descripción |
|---|---|
| `POST /register` | Crea usuario (sin verificar), encola email de verificación |
| `POST /verify-email` | Consume token, marca `emailVerifiedAt` |
| `POST /login` | Verifica credenciales, crea sesión, emite tokens (auto-selecciona org si hay una) |
| `POST /select-organization` | Fija la org activa de la sesión, reemite access token |
| `POST /refresh` | Rota el refresh, emite nuevos tokens |
| `POST /logout` | Revoca la sesión actual |
| `POST /logout-all` | Revoca todas las sesiones del usuario |
| `GET /sessions` | Lista sesiones activas (dispositivos) |
| `DELETE /sessions/:id` | Revoca una sesión específica |
| `POST /forgot-password` | Envía email de reset (respuesta genérica, sin enumeración) |
| `POST /reset-password` | Cambia contraseña y revoca todas las sesiones |

## Registro de organización (bootstrap)
`register → verify-email → login → POST /organizations` (el usuario se vuelve
Organization Owner; se crean la primera sucursal y almacén) `→ select-organization`.

## Rate limiting
`register`, `login`, `forgot-password`, `reset-password` están limitados por IP+ruta
vía Redis (`RateLimitGuard`).

## 2FA (TOTP) — preparado
`User.totpSecret` + `totpEnabledAt` existen en el modelo; el flujo de login puede
insertar un paso TOTP sin migración disruptiva. UI diferida.
