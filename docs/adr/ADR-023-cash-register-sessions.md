# ADR-023 — Turnos de caja (arqueo)

## Status
Aceptada — 2026-08-10

## Context
El efectivo cobrado (ADR-022) entra a un cajón físico. Necesitamos abrir/cerrar turnos
de caja con fondo inicial, registrar movimientos de efectivo no ligados a venta
(ingresos, retiros, gastos) y hacer arqueo al cierre (esperado vs contado), sin
descuadres ni turnos solapados.

## Decision
`CashRegister` (caja de una sucursal) → `CashSession` (turno) → cobros en efectivo +
`CashMovement` (movimientos del cajón).

- **Una sola sesión OPEN por caja**: índice único **parcial**
  `("registerId") WHERE status='OPEN'`. Aperturas concurrentes fallan en la BD, no en
  código; la concurrencia se resuelve en el motor, no con un check TOCTOU.
- **open(register, openingFloat)**: crea la sesión con el fondo (`>= 0`).
- **movement(session, type, amount, reason)**: DEPOSIT/WITHDRAWAL/EXPENSE (`amount > 0`),
  solo en sesión OPEN.
- **expectedCash(session)** = `openingFloat` + Σ pagos CASH COMPLETED + Σ DEPOSIT
  − Σ (WITHDRAWAL + EXPENSE). Derivado, nunca un campo editable.
- **close(session, countedCash)**: solo OPEN. Congela `expectedCash` (snapshot),
  guarda `countedCash`, calcula `difference = counted − expected` (sobrante/faltante),
  pasa a CLOSED. Inmutable después.

## Alternatives
- **`expectedCash` como columna que se va sumando**: rechazado; sería un campo mutable
  propenso a descuadre. Se deriva del ledger de pagos + movimientos.
- **Un check "¿hay sesión abierta?" antes de abrir**: rechazado (condición de carrera);
  el índice único parcial lo garantiza atómicamente.
- **Cobro en efectivo sin sesión**: rechazado; ADR-022 exige sesión OPEN para CASH.

## Consequences
- (+) Arqueo confiable: esperado reconstruible desde el ledger, diferencia auditable.
- (+) Imposible tener dos turnos abiertos en la misma caja (garantía de BD).
- (−) Cobrar en efectivo obliga a tener una caja abierta; es el comportamiento deseado.
