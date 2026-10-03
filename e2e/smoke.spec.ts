import { expect, test } from '@playwright/test';

// Test de humo: si esto falla, la app ni siquiera arranca.
test('la app carga y muestra el título', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Control de Finanzas');
  await expect(page.getByRole('heading', { name: 'Control de Finanzas' })).toBeVisible();
});
