import { expect, test } from './fixtures';
import { addExpense, createAccount, signIn } from './helpers';

// La app instalada abre y se usa sin conexión (SRS 10, TC-11, ADR 0027): el service worker sirve
// la app desde su copia, Auth recuerda la sesión y Firestore lee y escribe en la caché local.
test('sin conexión la app abre, carga un gasto y lo sube al reconectar (TC-11)', async ({
  page,
  context,
}) => {
  await signIn(page);
  await createAccount(page, 'Efectivo', '1000');
  const accounts = page.getByRole('region', { name: 'Cuentas' });
  await expect(accounts.getByText('$ 1.000,00')).toBeVisible();

  // Antes de cortar: que el servidor haya confirmado todo y que estén las categorías iniciales
  // (se siembran cuando el servidor confirma el perfil, ADR 0004).
  await expect(page.getByText('Sincronizado')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await expect(sheet.getByRole('button', { name: 'Comida' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Cerrar' }).click();

  // Espera a que el service worker termine de guardar la app.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await expect(page.getByText('Sin conexión')).toBeVisible();
  await expect(accounts.getByText('$ 1.000,00')).toBeVisible();

  await addExpense(page, 'Efectivo', '250', 'Comida');
  await expect(accounts.getByText('$ 750,00')).toBeVisible();

  // Al volver la conexión, el gasto se sube solo.
  await context.setOffline(false);
  await expect(page.getByText('Sincronizado')).toBeVisible({ timeout: 15_000 });
  await expect(accounts.getByText('$ 750,00')).toBeVisible();
});

// El manifiesto permite instalar la app, con el atajo para dictar (SRS 9.1, ADR 0023).
test('el manifiesto tiene el nombre, los íconos y el atajo "Dictar movimiento"', async ({
  page,
}) => {
  const response = await page.request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    icons: { purpose?: string }[];
    shortcuts: { name: string; url: string }[];
  };
  expect(manifest.name).toBe('Control de Finanzas');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  expect(manifest.shortcuts).toContainEqual(
    expect.objectContaining({
      name: 'Dictar movimiento',
      url: '/#/inicio?movimiento=nuevo&dictar=1',
    }),
  );
});
