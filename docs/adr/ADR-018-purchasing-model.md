# ADR-018 — Modelo de compras y proveedores

## Status
Aceptada — 2026-08-10

## Context
Necesitamos registrar proveedores y órdenes de compra que, al recibirse, alimenten el
inventario y el costo — sin romper la regla del ledger (el stock no se edita) ni la
exactitud financiera (decimal). Las compras preceden a cuentas por pagar (AP), que se
difiere.

## Decision
Dominio de compras con **Supplier**, **PurchaseOrder** (PO) y **PurchaseReceipt**
separados; la recepción es el único punto que toca inventario/costo (ver ADR-019).

- `Supplier` (tenant-scoped): datos fiscales, contacto, moneda, términos de pago, estado.
- `ProductSupplierReference`: relación variante↔proveedor (SKU del proveedor, último
  costo, lead time, preferido) — preparada desde Prompt 2, ahora materializada.
- `PurchaseOrder` (+`Item`): máquina de estados
  `DRAFT → SUBMITTED → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED`
  (+`CANCELLED`/`CLOSED`). Cantidades `Decimal(18,6)`, costos `Decimal(18,4)`,
  impuestos por renglón (`taxRate`). Folio `number` único por organización.
- `PurchaseReceipt` (+`Item`): recepción de mercancía **contra una PO o standalone**.
  Estados `DRAFT → POSTED → CANCELLED`. Solo al **postear** afecta inventario/costo.
- Devolución a proveedor = movimiento `SUPPLIER_RETURN` (onHand−), no un borrado.

## Alternatives
- **PO que descuenta/afecta inventario directamente**: rechazado; el inventario solo
  cambia con mercancía física (recepción), no con la orden.
- **Recepción sin PO obligatoria**: se permite standalone (compras rápidas), pero si hay
  PO se concilia contra sus renglones (recepción parcial soportada).
- **Incluir AP/pagos aquí**: fuera de alcance; se difiere al dominio financiero.

## Consequences
- (+) Separación limpia: proveedor → orden → recepción física → inventario/costo.
- (+) Recepción parcial y conciliación contra PO; devoluciones auditables.
- (−) Más entidades; justificado por integridad y trazabilidad de compras.
