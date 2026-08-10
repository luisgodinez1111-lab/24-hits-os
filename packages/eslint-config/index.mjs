import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Config ESLint compartida del monorepo (flat config). Reglas pragmáticas:
// TypeScript estricto ya lo cubre tsc; aquí atrapamos código muerto y errores comunes.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.config.*",
      "**/next-env.d.ts",
      "packages/database/prisma/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  }
);
