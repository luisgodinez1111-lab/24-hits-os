# ADR-015 — Modelado de producto y variante

## Status
Aceptada — 2026-08-09

## Context
Un producto comercial (p.ej. "Hyper Bar 120K") tiene múltiples presentaciones por
sabor. Duplicar el producto completo por cada sabor genera redundancia y rompe reportes.

## Decision
Separar **Product** (modelo comercial) de **ProductVariant** (unidad vendible/inventariable).

- `Product`: marca, categoría, nombre, estado (`DRAFT/ACTIVE/INACTIVE/DISCONTINUED`).
- `ProductVariant`: `flavorId?`, **`sku` único por organización** (no global entre
  tenants), unidades de compra/venta, `unitsPerPurchaseUnit`, `trackInventory`,
  `allowBackorder=false` inicial.
- El **inventario, precios y costos se llevan a nivel de variante**, no de producto.
- `Flavor`, `Brand`, `Category`, `UnitOfMeasure` son entidades reutilizables
  (no texto libre), tenant-scoped.
- Códigos de barras en `ProductBarcode` (EAN/UPC/CODE128/QR_INTERNAL/OTHER), buscables,
  únicos por organización.

Ejemplo: Brand "Hyper Bar" → Product "Hyper Bar 120K" → Variant "…/Blue Razz" (SKU HB120-BR).

## Alternatives
- **Un producto por sabor**: rechazado (redundancia, reportes rotos).
- **Sabor como texto en la variante**: rechazado; no reutilizable ni consultable.
- **Atributos genéricos (EAV) para variantes**: flexible pero complejo; el sabor
  explícito cubre el caso real de vape; se puede añadir EAV después sin romper esto.

## Consequences
- (+) Catálogo normalizado; reportes por marca/categoría/sabor limpios.
- (+) SKU por tenant permite catálogos independientes por organización.
- (−) Crear producto requiere al menos una variante para inventariar; asumido.
