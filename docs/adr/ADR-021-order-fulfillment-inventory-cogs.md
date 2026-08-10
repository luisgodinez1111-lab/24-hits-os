# ADR-021 — Cumplimiento de pedido → inventario + COGS

## Status
Aceptada — 2026-08-10

## Context
Un pedido compromete y luego entrega mercancía. El compromiso debe proteger la
disponibilidad (concurrencia); la entrega debe mover inventario físico y capturar el
costo de lo vendido (COGS) como snapshot, sin recalcular la historia (ADR-014).

## Decision
Dos transiciones tocan inventario, ambas atómicas (`withTenant` + RLS), reutilizando el
motor de Prompt 2:

1. **confirm(order)** — por renglón: resuelve precio (lista o override), **reserva**
   inventario vía `ReservationService.reserve` (bloqueo `FOR UPDATE`, valida
   disponibilidad, idempotente). Guarda `reservationId` en el renglón. Baja `available`,
   NO toca `onHand`. Si no hay stock → `INVENTORY_INSUFFICIENT`.
2. **fulfill(order)** — por renglón con reserva: dentro de una transacción
   - toma el `averageCost` actual (COGS),
   - aplica movimiento `SALE` (`onHand -= qty`, `unitCost = averageCost` como snapshot),
   - libera el `reserved` de la reserva y la marca `CONSUMED`,
   - reduce la base de cantidad del costo promedio (`reduceOnOutbound`),
   - guarda `fulfilledQuantity` y `unitCostSnapshot` en el renglón.
   Estado → `FULFILLED` (o `PARTIALLY_FULFILLED`).

**cancel(order)**: si está `CONFIRMED`, libera todas las reservas (`available` se
restaura) y pasa a `CANCELLED`. No se cancela un pedido ya `FULFILLED`.

## Alternatives
- **Descontar `onHand` al confirmar**: rechazado; la mercancía sale al entregar, no al
  comprometer. `available` sí baja (por la reserva).
- **Recalcular COGS después**: rechazado; el costo se captura como snapshot en el
  movimiento y el renglón (no se recalcula la historia).

## Consequences
- (+) Disponibilidad protegida al confirmar; existencia y COGS correctos al entregar.
- (+) Reutiliza reservas, ledger y costo promedio ya probados; nada de lógica ficticia.
- (+) Cancelar antes de entregar restaura disponibilidad limpiamente.
- (−) `fulfill` es una operación pesada (varios renglones × lock); aceptable por integridad.
