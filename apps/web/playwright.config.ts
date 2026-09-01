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
  },
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
