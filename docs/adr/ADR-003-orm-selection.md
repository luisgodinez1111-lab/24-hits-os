# ADR-003 — Selección de ORM: Prisma

## Status
Aceptada — 2026-08-09

## Context
Necesitamos una única capa de acceso a datos para PostgreSQL, con migraciones
versionadas, tipos generados y soporte para una estrategia de multi-tenancy que
incluye **Row Level Security (RLS)**. Los candidatos son Prisma y Drizzle. La
decisión debe balancear seguridad de tenancy, velocidad de desarrollo, madurez y la
experiencia previa del equipo (que ya opera Prisma en otros productos).

## Decision
Adoptar **Prisma** como ORM único. **No** se usará Drizzle.

Puntos clave de la implementación con Prisma para soportar los requisitos:

1. **RLS + tenant context**: RLS se activa en PostgreSQL a nivel de tabla. En cada
   request se abre una transacción interactiva (`prisma.$transaction`) y se ejecuta
   `SELECT set_config('app.current_org_id', $1, true)` antes de las consultas. Las
   políticas RLS filtran por `current_setting('app.current_org_id')`. Prisma soporta
   esto vía **client extensions** que envuelven las operaciones en la transacción con
   el `SET LOCAL` correspondiente (ver `packages/database`).
2. **Defensa en profundidad**: RLS es la última línea. Por encima hay filtros
   explícitos por `organization_id` en la capa de repositorio (ver ADR-004), de modo
   que la seguridad no depende de una sola capa.
3. **Migraciones**: `prisma migrate` con `directUrl` para conexión directa.

## Alternatives
- **Drizzle**: SQL-first, control fino, RLS más "natural" al escribir SQL directo y
  overhead menor. Contras: ecosistema más joven, menos batería de tooling (Studio,
  seeds, introspección), y el equipo tiene menos experiencia → más riesgo de errores
  en un fundamento crítico. La ventaja de RLS es real pero **alcanzable con Prisma**
  mediante extensions + `SET LOCAL`.
- **TypeORM**: descartado (mantenimiento irregular, patrones legacy).
- **Knex/SQL a mano**: máximo control, mínima productividad y sin tipos generados.

## Consequences
- (+) Productividad alta y tipos generados de punta a punta; el equipo ya lo domina.
- (+) Studio y seeds aceleran desarrollo y QA.
- (+) RLS soportado vía extension transaccional; multi-tenancy con defensa en capas.
- (−) RLS con Prisma exige el patrón de transacción con `SET LOCAL` (no es "gratis");
  se centraliza en `packages/database` para que ningún módulo lo implemente mal.
- (−) Prisma añade una capa de abstracción; para queries muy calientes se permitirá
  `queryRaw` puntual y auditado.
- Reevaluación: si un módulo futuro exige SQL analítico intensivo, se permite Drizzle
  o `queryRaw` **acotado a ese módulo**, nunca mezclando ORMs en el núcleo.
