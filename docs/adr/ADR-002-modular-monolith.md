# ADR-002 — Monolito modular (no microservicios)

## Status
Aceptada — 2026-08-09

## Context
El producto abarcará ventas, inventario, CRM, logística y analítica. Existe la
tentación de arrancar con microservicios "porque escala". En esta etapa el equipo
es pequeño, el dominio aún se está descubriendo y las fronteras entre módulos no son
estables. Los microservicios prematuros imponen costo operativo (despliegue,
observabilidad distribuida, consistencia eventual, transacciones distribuidas) sin
beneficio real.

## Decision
Construir un **monolito modular** en `apps/api` (NestJS). Cada dominio es un
**módulo** de Nest con frontera explícita: `auth`, `iam` (tenancy/RBAC), `audit`, y
futuros `inventory`, `sales`, etc. La comunicación entre módulos es in-process vía
interfaces de servicio; el acceso a datos se encapsula por módulo. El `worker` es un
proceso separado que comparte el mismo código de dominio pero se despliega aparte
para trabajo asíncrono.

Regla: **nada de dependencias circulares entre módulos**; los contratos compartidos
viven en `packages/contracts`.

## Alternatives
- **Microservicios desde el día 1**: rechazado por costo operativo y fronteras aún
  inestables. Se revisará solo si un módulo concreto necesita escalado/tecnología
  independiente demostrable.
- **Monolito no modular (big ball of mud)**: rechazado; imposibilita extraer un
  módulo a servicio en el futuro.

## Consequences
- (+) Transacciones ACID locales, refactor sencillo, un solo pipeline de despliegue.
- (+) Fronteras de módulo preparan una eventual extracción a servicio si se justifica.
- (−) Todo escala junto; se mitiga con worker separado y, más adelante, réplicas de
  lectura y colas.
- (−) Requiere disciplina para no cruzar fronteras de módulo (se vigila en review y
  con reglas de lint de imports).
