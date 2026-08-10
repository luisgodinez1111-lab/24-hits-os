# ADR-001 — Arquitectura de monorepo

## Status
Aceptada — 2026-08-09

## Context
24 HITS OS tendrá múltiples deployables (API, worker, web) que comparten
contratos, tipos, modelo de datos, lógica de auth y componentes de UI. Necesitamos
que un cambio en un contrato o en el esquema se propague de forma segura y tipada a
todos los consumidores, sin publicar paquetes a un registro ni versionar a mano.

## Decision
Usar un **monorepo** gestionado con **pnpm workspaces + Turborepo**.

- `pnpm` por su `node_modules` aislado (evita phantom dependencies) y su eficiencia
  de disco/instalación con enlaces duros.
- `Turborepo` para orquestar tareas (`build`, `lint`, `typecheck`, `test`) con grafo
  de dependencias y caché incremental.
- `apps/*` contiene deployables; `packages/*` contiene librerías internas
  consumidas vía `workspace:*`.

## Alternatives
- **Multi-repo + registro privado**: aísla equipos pero introduce fricción de
  versionado y desincronización de contratos. Excesivo para un equipo pequeño.
- **Nx**: potente pero con más superficie conceptual y generadores propios;
  Turborepo es más simple y suficiente.
- **npm/yarn workspaces sin Turbo**: sin caché de tareas ni grafo; builds lentos.

## Consequences
- (+) Contratos y tipos compartidos con seguridad de compilación de punta a punta.
- (+) Un solo `pnpm install`; refactors atómicos entre apps y packages.
- (+) Caché de Turbo acelera CI notablemente.
- (−) Tooling de monorepo requiere disciplina (boundaries entre packages).
- (−) El repo crece; se mitiga con límites claros y `packages/shared` NO genérico
  (ver estructura). Los deploys se filtran por app (`pnpm --filter`).
