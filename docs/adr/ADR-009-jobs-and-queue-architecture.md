# ADR-009 — Jobs y arquitectura de colas

## Status
Aceptada — 2026-08-09

## Context
Habrá trabajo asíncrono: envío de correos, generación de reportes, imports/exports,
alertas y limpieza de sesiones. No debe ejecutarse dentro del ciclo request/response del
API (latencia, reintentos, picos). Ya usamos Redis para rate limiting y cache, así que
conviene reaprovecharlo.

## Decision
**BullMQ sobre Redis**, con un proceso `apps/worker` dedicado.

- **Productor**: `apps/api` encola jobs (p.ej. `email.send`) vía un `QueueService`
  compartido en `packages/shared`/`packages/observability`.
- **Consumidor**: `apps/worker` corre los *workers* de BullMQ, aislado del API para no
  competir por CPU con las requests y para escalar por separado.
- **Colas iniciales**: `email` (job `email.send`) funcional de punta a punta en esta
  fase. Estructura lista para `reports`, `imports`, `exports`, `maintenance`.
- **Fiabilidad**: reintentos con backoff exponencial, `removeOnComplete` con retención
  acotada, y **dead-letter** lógico (jobs fallidos retenidos para inspección).
- **Trazabilidad**: cada job transporta `correlationId` y `organizationId` para
  correlacionar con logs y auditoría (ver observabilidad).
- **Locks distribuidos**: BullMQ/Redis habilitan locks para jobs que no deben
  solaparse (futuro), sin introducir otra dependencia.

## Alternatives
- **pg-boss (colas en PostgreSQL)**: evita Redis, transaccional con la BD; pero ya
  tenemos Redis y BullMQ ofrece mejor ecosistema de workers, rate limiting y flows.
- **Cloud (SQS/PubSub)**: acopla a un proveedor y añade latencia/costo en esta etapa;
  la abstracción `QueueService` permite migrar si se justifica.
- **Ejecutar en el API con `setImmediate`/cron in-process**: rechazado; sin durabilidad,
  reintentos ni aislamiento de recursos.

## Consequences
- (+) Trabajo pesado fuera del path de request; reintentos y backoff de fábrica.
- (+) Worker escala independiente del API.
- (+) Reutiliza Redis (una pieza menos de infraestructura nueva).
- (−) El worker es otro deployable a operar y observar.
- (−) Redis se vuelve dependencia crítica para asíncrono; se mitiga con health checks,
  persistencia AOF y jobs idempotentes.
