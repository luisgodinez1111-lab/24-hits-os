# ADR-012 — Estrategia de reservas (subledger de disponibilidad)

## Status
Aceptada — 2026-08-09

## Context
Reservar mercancía para un pedido **no cambia la existencia física** (`onHand`),
cambia la **disponibilidad** (`available`). Mezclar ambos en el ledger físico
confunde los conceptos y complica la conciliación.

## Decision
**Separar el ledger físico de las reservas.** Las reservas viven en su propia entidad
`InventoryReservation` (subledger de disponibilidad), no como movimientos IN/OUT del
ledger físico.

- Reservar/liberar/consumir ajusta `InventoryBalance.reserved` (y por tanto
  `available`), **sin** tocar `onHand`.
- `InventoryReservation` tiene estados `ACTIVE, CONSUMED, RELEASED, EXPIRED,
  CANCELLED` y opcional `expiresAt` + `idempotencyKey`.
- **Consumir** una reserva (cuando exista venta/salida real) liberará `reserved` y
  generará el movimiento físico OUT correspondiente — eso se conecta en Prompt 3+.
- `RESERVATION` / `RESERVATION_RELEASE` existen en el enum de movimientos para
  trazabilidad opcional, pero el efecto sobre disponibilidad es vía el subledger.

## Alternatives
- **Reservas como movimientos del ledger físico**: rechazado; contaminaría `onHand`
  o exigiría tipos "fantasma" que restan disponibilidad pero no existencia.
- **Solo un contador `reserved` sin entidad**: no auditable ni expirable; se necesita
  la entidad para liberar por vencimiento y para idempotencia.

## Consequences
- (+) Existencia física y disponibilidad son conceptos distintos y correctos.
- (+) Reservas auditables, expirables e idempotentes.
- (−) Dos modelos a mantener (físico + disponibilidad); es el precio de la corrección.
