import { expect, test } from './fixtures';

// La app es privada (ADR 0026): una cuenta de Google fuera de la lista no ve errores de
// permisos sino un aviso claro, y puede volver a elegir cuenta.
test('una cuenta sin acceso ve "Esta app es privada" y puede usar otra', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
  const email = `extrano-${String(Date.now())}@gmail.com`;
  await page.evaluate((e) => window.e2eSignIn?.(e, 'Persona Extraña'), email);

  // Offline-first: la app muestra lo que tiene en la caché sin esperar al servidor, y el aviso
  // aparece cuando llega el rechazo (con el emulador tarda unos segundos).
  await expect(page.getByRole('heading', { name: 'Esta app es privada' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole('button', { name: 'Usar otra cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
});
