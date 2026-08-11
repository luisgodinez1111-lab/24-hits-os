# ADR-024 — Notas de venta (comprobante inmutable)

## Status
Aceptada — 2026-08-10

## Context
Tras vender y cobrar necesitamos emitir un comprobante (nota de venta) imprimible.
No es un CFDI fiscal, pero sí un documento con **folio consecutivo** y contenido que
no debe cambiar aunque el pedido se modifique después. Dos notas emitidas a la vez no
pueden compartir folio.

## Decision
`SaleNote` (+`Item`) es una **fotografía inmutable** del pedido al emitirse:

- Copia (snapshot) cliente (nombre/RFC), renglones (descripción, SKU, cantidad, precio,
  descuento, impuesto, total), totales y `paidTotal` (neto cobrado al momento).
- **Folio consecutivo por serie** vía `DocumentSequence`: se asigna con
  `UPDATE "DocumentSequence" SET "nextValue"=nextValue+1 ... RETURNING` dentro de la
  transacción. El bloqueo de fila serializa a los competidores → folios únicos y sin
  huecos por carrera. `number` = `SERIE-000123`.
- **Emitir** exige un pedido no DRAFT y no CANCELLED, y que no exista ya una nota
  ISSUED para ese pedido (se valida bajo el mismo lock del contador).
- **Cancelar** pasa ISSUED→CANCELLED con motivo; nunca se borra ni se edita. No toca
  inventario ni pagos (esos tienen su propio ciclo).

## Alternatives
- **Folio = cola aleatoria del UUID** (como en pedidos/PO): rechazado; un comprobante
  necesita consecutivo legible y auditable, no un folio aleatorio.
- **Nota que referencia el pedido en vivo**: rechazado; el comprobante debe congelar el
  estado al emitirse; cambios posteriores al pedido no deben alterar el documento.
- **`@@unique(orderId)`**: rechazado; impediría reemitir tras cancelar. Se valida "sin
  nota ISSUED activa" en el servicio.

## Consequences
- (+) Comprobante estable, con folio consecutivo seguro bajo concurrencia.
- (+) Cancelación auditable sin destruir el documento.
- (−) Duplica datos del pedido (snapshot); es justamente lo que se busca.
