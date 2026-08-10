# ADR-014 — Estrategia de costo promedio móvil

## Status
Aceptada — 2026-08-09

## Context
El costo debe ser exacto (decimal, nunca float) y valorizar inventario. Al recibir
mercancía a distinto costo, el costo promedio cambia hacia adelante, **sin** reescribir
la historia.

## Decision
**Costo promedio móvil (moving average)** por `variant` (a nivel organización;
extensible a almacén si se justifica), en `VariantCost` + historial `CostHistory`.

Fórmula (responsabilidad del backend):
```
newAverageCost = (prevQty * prevAvgCost + inQty * inUnitCost) / (prevQty + inQty)
```
- `VariantCost`: `averageCost`, `lastPurchaseCost`, `quantityOnHand` (para el cálculo),
  `currency`, `version`.
- `CostHistory`: cada cambio con `oldAverageCost/newAverageCost`, `sourceType`
  (`OPENING_BALANCE`, `MANUAL_COST_INITIALIZATION`, `ADJUSTMENT_COST`, futuro
  `PURCHASE_RECEIPT`), `changedBy`, `correlationId`.
- **No se recalcula la historia**: cuando existan ventas (Prompt 3+), el costo aplicado
  a cada transacción se guarda como **snapshot** en el movimiento (`unitCost`), no se
  recalcula.
- Todo con `Prisma.Decimal` (`NUMERIC`), nunca float.

## Alternatives
- **FIFO/LIFO por capas**: más preciso fiscalmente pero mucho más complejo (capas,
  consumo por lote). Se difiere; el modelo permite migrar si un cliente lo exige.
- **Costo estándar**: no refleja compras reales.

## Consequences
- (+) Simple, exacto y suficiente para valorización y margen.
- (+) Historia de costos preservada; snapshots evitan reescrituras.
- (−) No distingue capas por lote (FIFO); aceptable para esta etapa.
