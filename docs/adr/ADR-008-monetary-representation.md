# ADR-008 — Representación monetaria

## Status
Aceptada — 2026-08-09

## Context
El dinero mal representado corrompe un ERP. Los `float`/`double` introducen errores de
redondeo (0.1 + 0.2 ≠ 0.3) inaceptables en finanzas. El sistema es multi-moneda a
futuro (inicia en MXN) y maneja cantidades decimales de inventario (p.ej. kg, litros).

## Decision
**Nunca usar float para dinero ni cantidades.** Dos representaciones:

1. **Money** = entero en **unidades menores** (centavos) + código de moneda ISO-4217.
   - En dominio/aplicación: value object `Money { amountMinor: bigint, currency: string }`
     con aritmética segura (suma/resta en enteros; multiplicación por cantidad con
     redondeo explícito y documentado, *banker's rounding* por defecto).
   - En base de datos: `amount_minor BIGINT` + `currency CHAR(3)`. Nunca un `float`.
   - Serialización JSON: `{ "amountMinor": "12345", "currency": "MXN" }` (minor como
     string para no perder precisión en JS `number`). Un helper formatea a "$123.45".
2. **Decimal quantities** = `Prisma.Decimal` (respaldado por `NUMERIC(18,6)` en Postgres)
   para cantidades de inventario que admiten fracciones. Nunca float.

Moneda inicial: **MXN**. El código de moneda viaja siempre junto al monto; no se asume
la moneda por contexto global.

## Alternatives
- **NUMERIC/Decimal para dinero**: correcto en BD, pero en la capa de aplicación
  JS/TS carece de decimal nativo; obliga a una lib de decimal en todo cálculo. El
  patrón de enteros-menores es más difícil de romper accidentalmente y más rápido.
- **float/double**: rechazado categóricamente.
- **Un solo `Decimal` para todo**: mezclaría dinero y cantidades; se prefieren tipos
  distintos para que el compilador impida sumar pesos con litros.

## Consequences
- (+) Aritmética monetaria exacta; imposible sumar monedas distintas por accidente
  (el value object lo valida).
- (+) Multi-moneda desde el diseño.
- (−) Conversión en los bordes (entrada UI en "pesos.centavos" → minor). Se centraliza en
  `packages/shared` (`Money.fromMajor("123.45", "MXN")`).
- (−) `bigint` requiere cuidado en serialización JSON (se transporta como string).
