# @24hits/worker — Worker de fondo (BullMQ)

Proceso **persistente** (no serverless) que consume colas de Redis:

- **email** — envía correos encolados por el API (verificación, reset de contraseña, OTP).
- **maintenance** — jobs repetibles de inventario:
  - `reservation.expire` (60s) — libera reservas vencidas.
  - `inventory.balance.verify` (5 min) — detecta drift entre proyección y ledger.
  - `inventory.low_stock.scan` (10 min) — notifica stock bajo.
  - `inventory.orphan_holds.reconcile` (10 min) — **libera holds de inventario huérfanos** (red de seguridad; ver `inventory/reconcile-orphan-holds.ts`).

> ⚠️ **Si el worker no corre, nada de esto sucede:** los correos encolados no se
> envían y las redes de seguridad de inventario no se ejecutan. Es un componente
> de producción, no opcional.

## Por qué NO va en Vercel

Vercel es serverless (funciones efímeras). El worker mantiene conexiones abiertas
a Redis y corre jobs repetibles → necesita un **host de proceso continuo**
(Railway, Render, Fly, o una VM). El API sí va en Vercel; el worker no.

## Despliegue en Railway

El repo ya trae `nixpacks.toml` (raíz) con la build del worker. Pasos:

1. **Railway → New Project → Deploy from GitHub repo** → `24-hits-os`.
   Railway detecta `nixpacks.toml` y usa su build/start automáticamente.
2. **Variables de entorno** (Settings → Variables):

   | Variable | Valor | Obligatoria |
   |---|---|---|
   | `DATABASE_URL` | conexión de **`hits_app`** (la misma del API; respeta RLS, `withSystem` funciona) | Sí |
   | `REDIS_URL` | **la MISMA URL de Upstash que usa el API** (deben compartir Redis: el API encola, el worker consume) | Sí |
   | `JWT_ACCESS_SECRET` | 16+ caracteres (lo exige `loadEnv` aunque el worker no verifique JWT; reusa el del API) | Sí |
   | `JWT_REFRESH_SECRET` | 16+ caracteres (reusa el del API) | Sí |
   | `NODE_ENV` | `production` | Recomendada |
   | `EMAIL_PROVIDER` | `resend` para enviar correos de verdad (por defecto `console` = solo log) | Si envías correos |
   | `RESEND_API_KEY` | tu API key de Resend | Si `EMAIL_PROVIDER=resend` |

3. **Deploy.** En los logs debe aparecer: `Worker de 24 HITS OS iniciado`.

### Verificación
- Logs sin errores de conexión (Redis/Postgres).
- Tras ~1 min, aparecen corridas de los jobs de mantenimiento.
- Un correo de prueba (p.ej. reset de contraseña desde el API) llega si
  `EMAIL_PROVIDER=resend` está configurado.

## Local

```bash
pnpm --filter @24hits/worker dev     # tsx watch (necesita Redis + Postgres locales)
```
