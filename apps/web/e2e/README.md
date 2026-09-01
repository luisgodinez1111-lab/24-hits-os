# E2E (Playwright) — flujos que dan dinero

Pruebas de punta a punta que manejan la app como un usuario real (navegador),
cubriendo los flujos críticos: **POS** (cobrar) y **reparto** (entregar + cobrar).

## Requisitos
1. El stack corriendo:
   - Postgres + Redis (p.ej. `pnpm infra:up`).
   - API en `:4000` (`pnpm --filter @24hits/api dev` o build+start).
   - Web en `:3000` (`pnpm --filter @24hits/web dev`).
2. Datos: primero el seed dev, luego el seed E2E (determinista, idempotente):
   ```bash
   pnpm db:seed        # org/owner/sucursal/almacén dev
   pnpm db:seed-e2e    # producto+código+precio+stock, cliente y pedido de reparto
   ```
3. Navegadores de Playwright (una vez):
   ```bash
   pnpm --filter @24hits/web exec playwright install chromium
   ```

## Correr
```bash
pnpm --filter @24hits/web e2e          # headless
pnpm --filter @24hits/web e2e:ui       # modo UI (depurar)
pnpm --filter @24hits/web e2e:report   # ver el reporte HTML
```
Vuelve a correr `pnpm db:seed-e2e` antes de cada corrida (recrea el pedido de reparto
entregable y resetea el stock).

## Cómo funciona
- `auth.setup.ts` inicia sesión una vez (owner del seed) y guarda la sesión; los specs
  la reutilizan.
- `pos.spec.ts`: teclea el código `E2E-TEST-0001`, agrega al carrito y cobra por
  transferencia → verifica "Venta registrada".
- `reparto.spec.ts`: abre la Ruta, entrega el pedido sembrado (salta verificación),
  cobra por transferencia → verifica "Entregado y cobrado".

Nota: se cobra por **transferencia** a propósito — un cobro en efectivo (CASH) exige un
turno de caja abierto.

## Config
- `E2E_BASE_URL` (default `http://localhost:3000`)
- `E2E_EMAIL` / `E2E_PASSWORD` (default `owner@example.local` / `Owner123!Dev`)
