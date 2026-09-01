import { defineConfig, devices } from "@playwright/test";

// E2E de 24 HITS OS. Requiere el stack corriendo (web:3000 + api:4000 + Postgres +
// Redis) y los datos sembrados con `pnpm db:seed-e2e`. Ver e2e/README.md.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Los flujos consumen stock / cierran pedidos → serial y determinista.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // `next dev` compila las rutas al primer acceso → márgenes amplios.
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
  },
  // Playwright arranca api (:4000) + web (:3000) y espera a que estén listos; al
  // terminar los apaga. En local reutiliza los que ya tengas corriendo; en CI arranca
  // frescos. Requiere Postgres+Redis arriba y los datos sembrados (db:seed + db:seed-e2e).
  webServer: [
    {
      // API COMPILADO (no `tsx dev`): tsx/esbuild no emite metadata de decoradores y
      // rompe la inyección por tipo de Nest (Reflector → undefined en los guards).
      // Requiere `pnpm --filter @24hits/api build` antes (el CI lo hace).
      command: "pnpm --filter @24hits/api start",
      url: "http://localhost:4000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
    },
    {
      command: "pnpm --filter @24hits/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
    },
  ],
  projects: [
    // 1) Inicia sesión una vez y guarda la sesión.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2) Los tests reutilizan esa sesión.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
      dependencies: ["setup"],
    },
  ],
});
