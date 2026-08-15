# Runbook de producción — 24 HITS OS

Guía operativa para correr el sistema en producción con criterio senior. Cubre
topología, monitoreo, respaldos, incidentes, rotación de secretos y los
siguientes pasos de fiabilidad. Es un documento vivo: actualízalo con cada
cambio de infraestructura.

## 1. Topología

| Componente | Dónde | Notas |
|---|---|---|
| Web (Next.js) | Vercel | Consume la API por mismo origen (rewrite `/api/v1/*`) |
| API (NestJS) | Vercel serverless (`serverless.ts` + `api/index.mjs`) | `/health`, `/ready` fuera del prefijo |
| Worker (BullMQ) | **Pendiente de desplegar** (Railway/nixpacks listo) | Envía emails y tareas de mantenimiento |
| Postgres | Neon | `DATABASE_URL` pooled (runtime), `DIRECT_URL` unpooled (migraciones/worker) |
| Redis | Upstash | Rate limiting distribuido + colas |

## 2. Monitoreo y salud

- **Liveness**: `GET /health` (rápido, sin dependencias). **Readiness**: `GET /ready`.
- **Tracing**: OpenTelemetry ya está integrado (`@24hits/observability`, `initTelemetry`).
  Para **activarlo** define en la API el endpoint OTLP:
  - `OTEL_EXPORTER_OTLP_ENDPOINT` (o el que consuma `initTelemetry`) apuntando a tu colector (Grafana Tempo, Honeycomb, Dash0, etc.).
- **Alertas mínimas a configurar** (uptime + APM):
  - Uptime check cada 1–2 min contra `/health` con alerta si falla 2 veces seguidas.
  - Alerta por tasa de 5xx > 1% en 5 min.
  - Alerta por backlog de la cola (jobs en espera) por encima de un umbral.
- **Error tracking (pendiente)**: añadir Sentry (web + api) para agregación de errores de runtime. Wiring recomendado: `@sentry/node` en `main.ts` y en `AllExceptionsFilter`, **gated por `SENTRY_DSN`** (no-op si no está definido); `@sentry/nextjs` en el web.

## 3. Respaldos y recuperación (Neon)

> Regla: "si no probaste el restore, no tienes backup".

- **PITR**: Neon retiene historial (branching). Confirma la ventana de retención del plan.
- **Simulacro de restauración (trimestral, obligatorio)**:
  1. Crea una branch desde un punto en el tiempo (p. ej. hace 1 h).
  2. Apunta un despliegue de staging a esa branch (`DATABASE_URL` de la branch).
  3. Verifica integridad: totales de ventas, pagos, existencias vs. lo esperado.
  4. Documenta el tiempo de recuperación (RTO) y el punto (RPO) logrados.
- **Export lógico adicional** (defensa en profundidad): `pg_dump` mensual con la `DIRECT_URL` a almacenamiento frío (R2/S3), cifrado.
- **Migraciones**: aplicar SIEMPRE con `DIRECT_URL` (unpooled). Nunca editar una migración ya aplicada en producción; cambios destructivos con patrón expand/contract.

## 4. Respuesta a incidentes

1. **Detectar**: alerta de uptime/5xx/cola.
2. **Triage**: revisar logs de Vercel (API/web) y trazas OTLP; identificar si es API, DB o Redis.
3. **Mitigar**:
   - Caída de API: revisar variables de entorno y último deploy; `rollback` en Vercel al deploy previo sano.
   - Saturación de DB: revisar conexiones (usar SIEMPRE pooled en runtime); pausar el worker si compite.
   - Redis caído: el rate limiting y las colas degradan; priorizar restaurar Upstash.
4. **Comunicar**: registrar el incidente (inicio, impacto, causa raíz, fix) en un post-mortem breve.
5. **Prevenir**: convertir la causa raíz en un test o una alerta.

## 5. Rotación de secretos (checklist)

Ejecutar ante sospecha de exposición (p. ej. una credencial en una captura) y de
forma periódica:

- [ ] **Neon**: reset del password del rol → actualizar `DATABASE_URL` (pooled) y `DIRECT_URL` (unpooled) en API y worker → redeploy.
- [ ] **Upstash Redis**: rotar token/URL → actualizar `REDIS_URL` → redeploy API y worker.
- [ ] **JWT**: rotar `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (invalida sesiones; comunicar).
- [ ] **Resend**: rotar las 6 llaves `RESEND_KEY_*` si aplica.
- [ ] Verificar que ningún secreto quede en logs ni en el historial de commits.

## 6. Próximos pasos de fiabilidad (planificados)

- **E2E (Playwright) en CI** — la mayor brecha de QA. Requiere levantar el stack en CI:
  servicio de Postgres (ya existe en el job de integración) + Redis + arranque de API y web + seed.
  Specs iniciales: login, venta en POS (escaneo→cobro→nota), pedido (confirmar→entregar→COGS),
  alta de cliente con zona. Correr en un job separado para no volver flaky el pipeline principal.
- **Paginación de listas grandes** — `products` ya usa cursor + búsqueda server-side. Replicar en
  `orders` y `customers`. Nota de diseño: separar el endpoint de **lista paginada** del de **lookup**
  (el que alimenta los combobox del POS/pedidos) para no romper esos consumidores.
- **Facturación/planes** — si el objetivo es comercializar: suscripciones, límites por plan y onboarding self-serve.
