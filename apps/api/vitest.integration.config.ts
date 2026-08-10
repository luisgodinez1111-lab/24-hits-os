import { defineConfig } from "vitest/config";

// Tests de integración: requieren PostgreSQL migrado (con RLS) y Redis.
// Se ejecutan con `pnpm --filter @24hits/api test:integration` tras `pnpm db:migrate`.
export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks", // aislamiento por proceso para conexiones de BD
  },
});
