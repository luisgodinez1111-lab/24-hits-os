# ADR-020 — Modelo de pedidos de venta

## Status
Aceptada — 2026-08-10

## Context
Necesitamos vender: registrar clientes y pedidos que reserven inventario al
confirmarse y lo consuman al entregarse, sin romper el ledger ni la exactitud
financiera. Pagos/caja se difieren (dominio financiero).

## Decision
Dominio de ventas con **Customer**, **Order** (+`Item`) y una máquina de estados que
separa compromiso (reserva) de entrega física (consumo):

`DRAFT → CONFIRMED → PARTIALLY_FULFILLED → FULFILLED → COMPLETED` (+`CANCELLED`).

- `Customer` (tenant-scoped): tipo RETAIL/WHOLESALE, límite de crédito, estado.
- `Order`: `branchId`, `warehouseId` (origen del stock), `customerId?`, folio `number`
  único por org (cola aleatoria del UUID, no el prefijo timestamp), moneda, totales
  (subtotal/descuento/impuesto/total en Decimal), `paymentStatus` (campo simple, sin
  entidad de pagos aún), `priceListId?`.
- `OrderItem`: `variantId`, `quantity`, `unitPrice`, `discount`, `taxRate`, `lineTotal`,
  `reservationId?` (la reserva creada al confirmar), `fulfilledQuantity`,
  `unitCostSnapshot?` (COGS capturado al entregar).
- **Precio**: se resuelve de la lista de precios (ADR-016) al crear/confirmar; se puede
  sobrescribir por renglón.

## Alternatives
- **Pedido que descuenta stock al crearse**: rechazado; crear un pedido no mueve
  inventario. Se reserva al confirmar, se consume al entregar.
- **Incluir pagos/caja aquí**: fuera de alcance; `paymentStatus` es un campo, no un módulo.
- **Sin reservas (solo descontar al vender)**: rechazado; perdería el compromiso de stock
  y la protección de concurrencia (dos pedidos por la última unidad).

## Consequences
- (+) Compromiso (reserva) y entrega (consumo físico) separados y auditables.
- (+) Reutiliza reservas concurrentes (ADR-013) y costo promedio (ADR-014) de Prompt 2.
- (−) Más estados y una reserva por renglón que hay que liberar al cancelar; necesario.
