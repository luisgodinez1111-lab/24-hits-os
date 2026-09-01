import { test as setup } from "@playwright/test";

// Inicia sesión UNA vez y guarda la sesión (cookies) en un archivo; los specs la
// reutilizan (storageState). Credenciales del seed dev, sobreescribibles por env.
const EMAIL = process.env.E2E_EMAIL ?? "owner@example.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "Owner123!Dev";
const AUTH_FILE = "e2e/.auth/owner.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Espera a salir del login (ya autenticado). Si la app pide seleccionar
  // organización, seleccionamos la primera disponible.
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  if (page.url().includes("select-organization")) {
    await page.getByRole("button").first().click().catch(() => undefined);
    await page.waitForURL(/\/app/, { timeout: 20_000 }).catch(() => undefined);
  }

  await page.context().storageState({ path: AUTH_FILE });
});
