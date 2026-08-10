# ADR-010 — Arquitectura de ledger de inventario

## Status
Aceptada — 2026-08-09

## Context
El inventario mal modelado (un campo `product.stock` editable) corrompe ventas,
compras y finanzas. Necesitamos que la existencia sea **auditable, reconstruible y no
falsificable**, y que toda variación tenga un origen trazable.

## Decision
La fuente de verdad de existencias físicas es un **ledger append-only**:
`InventoryMovement`. Cada movimiento tiene `direction` (IN/OUT/NEUTRAL), `quantity`
(> 0), tipo, referencia, usuario, `correlationId` y opcional `idempotencyKey`.

- **Prohibido** editar/borrar movimientos. Las correcciones se hacen con movimientos
  compensatorios (p.ej. `COUNT_ADJUSTMENT_IN/OUT`, `DATA_CORRECTION`).
- `product.stock` **no existe**. La existencia = suma del ledger, materializada en
  `InventoryBalance` (ver ADR-011).
- Toda mutación de inventario ocurre por un servicio de dominio que escribe el
  movimiento y actualiza la proyección **en la misma transacción**.

## Alternatives
- **Campo mutable de stock**: rechazado (regla fundamental); no auditable, propenso a
  race conditions y a corrupción.
- **Event sourcing completo con event store genérico**: excesivo; el ledger tabular
  relacional cubre el requisito con menor complejidad y mejores queries.

## Consequences
- (+) Historia inmutable, reconstruible y auditable; base sólida para ventas/compras.
- (+) Correcciones rastreables (nunca "desaparece" un movimiento).
- (−) Escribir inventario cuesta más (movimiento + proyección en transacción); se
  asume por integridad.
- (−) Requiere disciplina: ningún módulo escribe existencias fuera del servicio de ledger.
