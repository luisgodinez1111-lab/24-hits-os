import { test, expect } from "@playwright/test";

// E2E del flujo de dinero en POS: teclear código de barras → agregar → cobrar.
// Requiere: `pnpm db:seed && pnpm db:seed-e2e`, y el stack corriendo (web+api+pg+redis).
test("POS — teclear código, agregar al carrito y cobrar", async ({ page }) => {
  await page.goto("/app/sales/pos");

  // Agrega el producto sembrado por su código de barras.
  await page.getByTestId("pos-barcode-input").fill("E2E-TEST-0001");
  await page.getByTestId("pos-add-btn").click();

  // Aparece en el carrito (nombre de la variante sembrada).
  await expect(page.getByText("E2E Variante")).toBeVisible();

  // Cobra por TRANSFERENCIA (no requiere turno de caja abierto, a diferencia de CASH).
  await page.locator("select").first().selectOption("TRANSFER");
  await page.getByTestId("pos-charge-btn").click();

  // Confirmación de venta registrada.
  await expect(page.getByText(/Venta registrada/i)).toBeVisible();
});
