# ADR-017 — Ciclo de vida de transferencias entre almacenes

## Status
Aceptada — 2026-08-09

## Context
Mover inventario de A a B con una sola actualización es una "transferencia atómica
ficticia": pierde la mercancía en tránsito, impide recepción parcial y rompe la
trazabilidad y la conciliación.

## Decision
Transferencia con **estado en tránsito** y máquina de estados explícita:
`DRAFT → REQUESTED → APPROVED → IN_TRANSIT → PARTIALLY_RECEIVED | RECEIVED`
(+ `CANCELLED`).

Flujo de inventario:
1. **Ship** (origen): `TRANSFER_OUT` reduce `onHand` en A y aumenta
   `inTransitOutgoing`. La mercancía **no está disponible** en A ni en B.
2. **Receive** (destino): `TRANSFER_IN` aumenta `onHand` en B por la cantidad recibida y
   reduce el tránsito. Soporta **recepción parcial**: si se envían 10 y se reciben 9, el
   faltante queda **abierto como incidencia** (`PARTIALLY_RECEIVED`), nunca se completa
   en silencio.
- `WarehouseTransferItem` guarda `requestedQuantity/shippedQuantity/receivedQuantity` y
  `unitCostSnapshot`. Constraint `sourceWarehouse != destinationWarehouse`.
- `ship`/`receive` son **transaccionales** e **idempotentes** (idempotencyKey).

## Alternatives
- **Update directo A→B**: rechazado (regla absoluta 11).
- **Sin estado parcial**: rechazado; la vida real tiene mermas/faltantes en tránsito.

## Consequences
- (+) Trazabilidad completa, recepción parcial e incidencias explícitas.
- (+) El inventario en tránsito no se cuenta dos veces.
- (−) Máquina de estados más rica que un simple move; necesaria para corrección.
