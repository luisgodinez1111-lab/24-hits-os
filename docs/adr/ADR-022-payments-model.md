# ADR-022 — Modelo de pagos

## Status
Aceptada — 2026-08-10

## Context
Un pedido (ADR-020) lleva `paymentStatus` como campo simple. Ahora necesitamos
registrar cobros reales contra el pedido, con exactitud financiera (Decimal, nunca
float), sin doble cobro bajo concurrencia y con trazabilidad total (nada se borra).

## Decision
`Payment` es un **ledger inmutable** de cobros aplicados a un `Order`:

- Campos: `method` (CASH/CARD/TRANSFER/OTHER), `amount` (Decimal 18,4, `> 0`),
  `currency`, `reference?`, `status` (COMPLETED/REVERSED), `cashSessionId?`
  (obligatorio si `method = CASH`), `branchId`, `idempotencyKey?`.
- **Neto pagado** = Σ `amount` de los pagos `COMPLETED` del pedido.
- **Anular** un pago no lo borra: marca `status = REVERSED` + `reversedAt` y crea un
  registro de reversa que apunta al original (`reversalOfId`, 1:1). Queda fuera del neto.
- `recordPayment` corre en `withTenant` + **bloqueo `FOR UPDATE` de la fila del pedido**;
  recalcula `paymentStatus` (PENDING/PARTIAL/PAID) desde el neto. Rechaza sobrepago
  (`PAYMENT_EXCEEDS_TOTAL`) y pedidos cancelados. Idempotente por `idempotencyKey`.
- Un pago en efectivo exige una **sesión de caja abierta** (ADR-023) y se ata a ella;
  reversar un pago en efectivo requiere que su sesión siga OPEN (no se toca un cajón cerrado).

## Alternatives
- **Reversas como monto negativo**: rechazado; complica CHECK `amount > 0` y los reportes.
  Un flip de `status` + fila de reversa es más claro y auditable.
- **Recalcular `paymentStatus` sin lock**: rechazado; dos cobros concurrentes podrían
  ambos pasar la validación de sobrepago y descuadrar el pedido.
- **Pagos sin pedido (anticipos/monedero)**: fuera de alcance; todo pago cuelga de un `Order`.

## Consequences
- (+) Cobros exactos, sin doble cobro, con historia inmutable y reversable.
- (+) `paymentStatus` del pedido siempre derivado del ledger (fuente única).
- (−) El lock por pedido serializa cobros del mismo pedido; irrelevante en la práctica.
