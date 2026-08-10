# ADR-016 — Modelo de precios

## Status
Aceptada — 2026-08-09

## Context
Un solo `product.price` es insuficiente: hay precios retail, mayoreo y especiales, por
sucursal/segmento, con vigencias e historial que no debe perderse.

## Decision
Modelo de **listas de precios** con historial:

- `PriceList` (`type` RETAIL/WHOLESALE/SPECIAL, `currency`, `branchId?`,
  `customerSegment?`, `validFrom/validTo?`, `status`).
- `PriceListItem` (`variantId`, `price`, `minimumPrice?`, `validFrom`, `validTo?`).
- `PriceHistory` (append-only): `oldPrice`, `newPrice`, `changedBy`, `reason?`,
  `correlationId`; cada cambio genera `AuditEvent` (`price.changed`).
- Todo `Prisma.Decimal` (`NUMERIC`), **nunca float**. `price >= 0`,
  `minimumPrice >= 0` por constraint.
- El **precio actual** se resuelve por lista+variante+vigencia (índices adecuados);
  el historial se conserva íntegro.
- **Costos filtrados en backend**: los endpoints de catálogo/inventario **no** incluyen
  costo salvo permiso `costs.read`; no se oculta solo en UI.

## Alternatives
- **Campo único de precio**: rechazado (sin segmentación ni historial).
- **Motor de reglas de precios completo**: excesivo hoy; el modelo permite añadir
  reglas/promos después (Prompt de ventas) sin rehacer.

## Consequences
- (+) Retail/mayoreo/especial con vigencias e historial auditable.
- (+) Exactitud financiera (decimal) y separación de costos por permiso.
- (−) Resolver "precio vigente" requiere lógica de vigencia + índices; asumido.
