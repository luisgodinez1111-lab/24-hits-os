# ADR-019 — Recepción de compra → inventario + costo promedio

## Status
Aceptada — 2026-08-10

## Context
La recepción de mercancía de un proveedor es el punto donde entra inventario físico y
donde el **costo promedio móvil** debe actualizarse (ADR-014). Debe ser atómico,
idempotente, auditable y sin race conditions, reutilizando el motor de inventario
existente (no reinventarlo).

## Decision
`PurchaseReceipt.post()` ejecuta, por cada renglón, dentro de UNA transacción
(`withTenant`, RLS incluido):

1. **Movimiento de inventario** `PURCHASE_RECEIPT` vía `LedgerService.applyMovement`
   → `onHand += cantidad` (bloqueo `FOR UPDATE`, invariante no-negativa, proyección +
   movimiento inmutable con `unitCost` como snapshot).
2. **Costo promedio móvil** vía `CostService.applyInboundCost`
   (`newAvg = (prevQty·prevAvg + inQty·inUnit)/(prevQty+inQty)`), fuente
   `PURCHASE_RECEIPT`, con `CostHistory`.
3. **Conciliación con la PO** (si existe): incrementa `receivedQuantity` del renglón y
   actualiza el estado de la PO (`PARTIALLY_RECEIVED`/`RECEIVED`).
4. **Referencia proveedor↔variante**: actualiza `lastCost`.
5. Estado del recibo → `POSTED`; `AuditEvent` (`purchase.received`).

- **Idempotencia**: `idempotencyKey` por recibo; el ledger dedup por
  `(org, idempotencyKey)` y el post se aplica una sola vez.
- **Reutilización**: no se duplica lógica de inventario/costo; se orquestan
  `LedgerService` + `CostService` (dominios de Prompt 2).

## Alternatives
- **Escribir onHand/averageCost directamente**: rechazado (rompe ledger e integridad).
- **Actualizar costo fuera de la transacción del movimiento**: rechazado; deben ser
  atómicos para no dejar costo y stock desalineados.

## Consequences
- (+) Entrada de mercancía atómica: stock + costo + conciliación PO en una transacción.
- (+) Reutiliza el motor probado de inventario (concurrencia, idempotencia, auditoría).
- (+) El costo aplicado a cada movimiento queda como snapshot (no se recalcula la historia).
- (−) `post()` es una operación pesada (varios renglones × lock); aceptable por integridad.
