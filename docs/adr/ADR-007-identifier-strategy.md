# ADR-007 — Estrategia de identificadores: UUID v7

## Status
Aceptada — 2026-08-09

## Context
Los IDs incrementales (`bigserial`) expuestos públicamente filtran volumen de negocio
(enumeración: "¿cuántos pedidos llevan?") y facilitan IDOR. Necesitamos IDs no
adivinables para entidades públicas, pero también buen rendimiento de índice
(los UUID v4 aleatorios fragmentan los índices B-Tree y penalizan inserciones).

## Decision
Usar **UUID v7** como identificador primario de todas las entidades de dominio.

- UUID v7 es **ordenable por tiempo** (timestamp en los bits altos) → localidad de
  inserción similar a un secuencial, sin fragmentar el índice como v4.
- No adivinable en la práctica (parte aleatoria) → apto para exposición pública.
- Se almacena en columnas `uuid` nativas de PostgreSQL (16 bytes, indexado eficiente).
- Generación en la aplicación con la librería `uuidv7` (PostgreSQL 16 no trae
  `uuidv7()` nativo; llegará en pg18). Se centraliza en `packages/shared` (`newId()`).
- Consistencia: **un solo** esquema de ID en todo el sistema. No mezclar con ULID.

## Alternatives
- **ULID**: equivalente funcional (ordenable, aleatorio) pero se almacena como texto
  (26 chars) o requiere conversión; UUID v7 encaja nativo en el tipo `uuid` de Postgres
  y en el ecosistema (Prisma, herramientas). Ambos válidos; se elige UUID v7 por
  compatibilidad nativa con el tipo de columna.
- **UUID v4**: no ordenable → fragmentación de índice e inserciones más lentas a escala.
- **bigserial**: rechazado para IDs públicos por enumeración/IDOR. Se permite `bigserial`
  interno solo para secuencias no expuestas (p.ej. numeración de folios con prefijo, que
  es un campo aparte, no el PK).

## Consequences
- (+) IDs seguros para exponer y con buen comportamiento de índice.
- (+) Ordenables por creación (útil para paginación por cursor).
- (−) 16 bytes vs 8 de bigint; costo de almacenamiento aceptable.
- (−) Dependencia de una librería de generación hasta adoptar `uuidv7()` nativo de
  PostgreSQL 18; el helper `newId()` aísla ese cambio futuro.
