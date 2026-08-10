# ADR-011 — Proyección de balance de inventario

## Status
Aceptada — 2026-08-09

## Context
Sumar el ledger completo en cada lectura no escala. Necesitamos existencias en O(1)
por `(organization, branch, warehouse, variant)` sin perder que el ledger es la
fuente de verdad.

## Decision
Tabla de proyección transaccional `InventoryBalance` con columnas
`onHand, reserved, allocated, damaged, quarantine, inTransitIncoming,
inTransitOutgoing, version, updatedAt`, única por
`(organizationId, warehouseId, variantId)`.

- Se actualiza **en la misma transacción** que el `InventoryMovement` que la origina.
- **No es la fuente histórica**: es una proyección. Debe poder **reconstruirse** desde
  el ledger (`rebuildInventoryBalance()`), y un job de *drift detection*
  (`inventory.balance.verify`) compara proyección vs. ledger y **alerta** sin corregir
  en silencio.
- `available = onHand - reserved - allocated - damaged - quarantine` (nunca negativo;
  ver ADR-013).
- `version` habilita optimistic locking y detección de drift.

## Alternatives
- **Calcular siempre desde el ledger**: correcto pero lento a escala.
- **Cache en Redis**: no transaccional con la BD → riesgo de inconsistencia en fallos.
  La proyección en Postgres es transaccional con el movimiento.

## Consequences
- (+) Lecturas rápidas y consistentes con la escritura (misma transacción).
- (+) Auditable: se puede probar `ledger == projection`.
- (−) Doble escritura (ledger + balance); mitigado por transacción atómica.
- (−) Necesita herramienta de rebuild + verificación de drift (implementadas).
