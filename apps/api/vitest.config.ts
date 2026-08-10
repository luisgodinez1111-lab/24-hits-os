import { defineConfig } from "vitest/config";

// Tests unitarios (sin dependencias externas).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
