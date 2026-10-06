import { expect, test } from './fixtures';

// Test de humo: si esto falla, la app ni siquiera arranca.
test('la app carga y muestra el inicio de sesión', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Control de Finanzas');
  await expect(page.getByRole('heading', { name: 'Control de Finanzas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
});
