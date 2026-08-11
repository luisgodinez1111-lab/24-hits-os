# ADR-026 — Notificaciones in-app

## Status
Aceptada — 2026-08-10

## Context
El sistema necesita avisar a los operadores de eventos accionables (stock bajo/agotado,
más adelante pagos pendientes, drift de inventario) sin depender de que alguien mire un
reporte. Debe ser multi-tenant, sin ruido (no repetir la misma alerta) y con estado de
lectura.

## Decision
Centro de notificaciones **in-app** con un modelo `Notification` tenant-scoped:

- `recipientUserId` nulo = **difusión** a toda la organización; con valor = personal.
  El usuario ve las suyas + las de difusión (`recipientUserId = me OR NULL`).
- `type`/`severity` clasifican; `entityType`/`entityId` enlazan al recurso.
- **Deduplicación** por `dedupeKey` en ventana de 24h: una alerta recurrente
  (p.ej. `low-stock:<almacén>:<variante>`) no se vuelve a crear mientras siga vigente.
- **Generación de stock bajo**: `scanLowStockForOrg` (en `@24hits/database`, reutilizable)
  recorre `InventoryPolicy` habilitadas, calcula el disponible y crea LOW_STOCK
  (WARNING) o "sin existencias" (CRITICAL). Lo ejecuta el **worker** por cron
  (cross-tenant) y un endpoint bajo demanda.
- **Lectura**: el usuario marca leída una o todas; la difusión comparte estado de
  lectura (una alerta operativa atendida por alguien queda atendida para el equipo).

## Alternatives
- **Sólo email**: rechazado como base; el email es un canal adicional, no el registro.
  El ledger de notificaciones vive en la BD; el email queda como extensión.
- **Estado de lectura por usuario para difusión** (tabla puente): pospuesto; para
  alertas operativas el estado compartido es suficiente y más simple.
- **`@@unique(dedupeKey)`**: rechazado; impediría re-alertar cuando el problema
  reaparece tras resolverse. Se deduplica por ventana de tiempo.

## Consequences
- (+) Alertas accionables, deduplicadas, aisladas por tenant, con estado de lectura.
- (+) Generación de stock bajo reutilizada por worker (cron) y API (bajo demanda).
- (−) La difusión comparte estado de lectura; aceptable para alertas de operación.
