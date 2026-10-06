import { expect, test } from './fixtures';

// Test de humo: si esto falla, la app ni siquiera arranca.
test('la app carga y muestra el inicio de sesión', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Control de Finanzas');
  await expect(page.getByRole('heading', { name: 'Control de Finanzas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
});

// El APK necesita este archivo para abrir sin barra de direcciones (ADR 0028). Verifica que el
// build copie la carpeta con punto y que el servidor devuelva el JSON, no el index.html.
test('publica el assetlinks.json del APK', async ({ request }) => {
  const response = await request.get('/.well-known/assetlinks.json');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { target: { package_name: string } }[];
  expect(body[0]?.target.package_name).toBe('ar.jtg.finanzas');
});
