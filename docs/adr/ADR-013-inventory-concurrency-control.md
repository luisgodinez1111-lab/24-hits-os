# ADR-013 — Control de concurrencia de inventario

## Status
Aceptada — 2026-08-09

## Context
Caso crítico: un almacén tiene `available = 1`; dos usuarios reservan 1 a la vez.
**Solo uno debe lograrlo**; el otro recibe `INVENTORY_INSUFFICIENT`. Nunca puede
quedar `reserved = 2` ni `available < 0`.

## Decision
**Row-level locking pesimista** sobre la fila de `InventoryBalance` dentro de una
transacción, combinado con validación de invariante y `version`.

Patrón de toda operación que consume disponibilidad/existencia:
1. Abrir transacción (vía `withTenant`, que además fija RLS).
2. `SELECT ... FOR UPDATE` de la fila `InventoryBalance`
   `(organizationId, warehouseId, variantId)` → serializa a los competidores.
3. Calcular `available` y **validar la invariante** (`available >= quantity`,
   `onHand >= 0`, etc.); si falla → lanzar `INVENTORY_INSUFFICIENT` y abortar.
4. Escribir el `InventoryMovement` y actualizar el balance (incrementar `version`).
5. Commit.

Se usa `FOR UPDATE` (no `NOWAIT`) para que el segundo esperar y luego reevaluar con
datos frescos, obteniendo el rechazo correcto. Constraints de BD (`CHECK quantity>0`)
son la última red.

## Alternatives
- **Optimistic locking por `version`**: válido, pero bajo alta contención genera más
  reintentos; se conserva `version` para drift y como complemento.
- **`SERIALIZABLE`**: correcto pero con más abortos/retries y coste; se reserva para
  operaciones multi-fila si se justifica.
- **Updates atómicos condicionales** (`UPDATE ... WHERE available >= q`): potentes pero
  la disponibilidad es derivada de varias columnas; el lock explícito es más claro y
  auditable.

## Consequences
- (+) Imposible sobre-reservar o dejar inventario negativo bajo concurrencia.
- (+) Comportamiento determinista y testeable (test de última unidad obligatorio).
- (−) El lock serializa por `(warehouse, variant)`; contención acotada a la misma
  combinación, aceptable.
