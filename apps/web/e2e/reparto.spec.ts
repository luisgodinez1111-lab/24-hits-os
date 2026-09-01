import { test, expect } from "@playwright/test";

// E2E del flujo de reparto: ver el pedido en la Ruta → entregar → cobrar.
// El pedido se ENTREGA por el flujo real (confirma + fulfill + cobro).
// Requiere: `pnpm db:seed && pnpm db:seed-e2e`, y el stack corriendo.
test("Reparto — entregar y cobrar el pedido de la ruta", async ({ page }) => {
  await page.goto("/app/sales/route");

  // El pedido sembrado aparece como parada → su botón "Entregar" está visible.
  const deliver = page.getByTestId("route-deliver-btn");
  await expect(deliver).toBeVisible({ timeout: 20_000 });
  await deliver.click();

  // Diálogo de entrega: saltar verificación por escaneo (producto de prueba).
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("deliver-skip-verify").check();

  // Cobrar por TRANSFERENCIA y entregar.
  await dialog.locator("select").first().selectOption("TRANSFER");
  await dialog.getByTestId("deliver-confirm-btn").click();

  // Confirmación de entrega + cobro.
  await expect(page.getByText(/Entregado y cobrado/i)).toBeVisible();
});
