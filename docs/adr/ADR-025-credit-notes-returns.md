# ADR-025 — Devoluciones / notas de crédito

## Status
Aceptada — 2026-08-10

## Context
Un cliente devuelve mercancía de una venta ya documentada (nota de venta, ADR-024).
Hay que: (1) reingresar la mercancía al inventario sin romper el ledger, (2) revertir
el COGS reconocido, (3) documentar el crédito con folio consecutivo, y opcionalmente
(4) reembolsar. Todo exacto y auditable, sin editar ni borrar historia.

## Decision
`CreditNote` (+`Item`) es una **devolución documentada** contra una nota de venta
ISSUED, reutilizando el motor de Prompt 2/4/5:

- **Inventario**: por renglón devuelto aplica `CUSTOMER_RETURN` (`onHand += qty`) con
  `unitCost` = costo capturado en la venta (`SaleNoteItem.unitCostSnapshot`).
- **Costo/COGS**: `cost.applyInboundCost` con ese costo (sourceType `SALE_RETURN`)
  reintegra la base de cantidad del promedio móvil → revierte el COGS al costo real
  de la venta (no al promedio actual). Queda en `CostHistory`.
- **Tope de devolución**: la cantidad devuelta acumulada por renglón (sumando notas de
  crédito ISSUED) no puede exceder lo vendido → `RETURN_EXCEEDS_SOLD`.
- **Folio consecutivo por serie** ("NC") vía `DocumentSequence` con `UPDATE ... RETURNING`
  (bloqueo de fila), igual que las notas de venta.
- **Reembolso**: opcional. Si es en efectivo con turno abierto, genera un `CashMovement`
  WITHDRAWAL por el total (sale del cajón). Otros métodos se registran informativamente.
- **Inmutable**: no se cancela ni edita (un error se corrige con otro documento). El
  snapshot de cliente/renglones/totales congela el crédito.

## Alternatives
- **Reingresar al promedio actual**: rechazado; distorsiona el COGS. Se reingresa al
  costo capturado en la venta.
- **Devolver contra el pedido en vez de la nota**: rechazado; el crédito se emite contra
  un comprobante ISSUED (trazabilidad documento↔documento).
- **Permitir cancelar la nota de crédito**: rechazado por ahora; revertir una devolución
  (sacar stock de nuevo + rehacer COGS + revertir reembolso) es propenso a inconsistencias.

## Consequences
- (+) Inventario y COGS vuelven a cuadrar exactamente tras la devolución.
- (+) Folio seguro bajo concurrencia; crédito y reembolso auditables.
- (−) La nota de crédito es final (sin cancelación); es el comportamiento buscado.
