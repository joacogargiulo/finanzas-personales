import { expect, test } from './fixtures';
import { addExpense, createAccount, signIn } from './helpers';

// "Borrar mi cuenta" de punta a punta (ADR 0006 y 0030): con el emulador de Auth, el inicio de
// sesión es reciente, así que no hace falta la ventana de Google. Al volver a entrar con la
// misma cuenta de Google, la app arranca vacía.
// Antes de borrar, la app desvincula WhatsApp en el Worker (ADR 0033). El Worker es falso
// (`VITE_DICTATION_URL` apunta a https://dictado.invalid): Playwright responde en su lugar.
test('borra la cuenta y al volver a entrar no queda nada', async ({ page }) => {
  const unlinks: string[] = [];
  await page.route('https://dictado.invalid/whatsapp/vinculo', (route) => {
    unlinks.push(route.request().method());
    return route.fulfill({ json: { phone: null } });
  });
  const email = await signIn(page);
  await createAccount(page, 'Efectivo', '10000');
  await addExpense(page, 'Efectivo', '1500', 'Comida');

  await page.getByRole('link', { name: 'Ajustes' }).click();
  const card = page.getByRole('region', { name: 'Borrar mi cuenta' });
  // El botón se habilita cuando el gasto se subió y la app está al día con el servidor.
  await card.getByRole('button', { name: 'Borrar mi cuenta' }).click({ timeout: 15_000 });

  const dialog = page.getByRole('dialog', { name: '¿Borrar tu cuenta?' });
  await dialog.getByLabel(/Para confirmar/).fill('BORRAR');
  await dialog.getByRole('button', { name: 'Borrar mi cuenta' }).click();

  await expect(page.getByRole('heading', { name: 'Tu cuenta se borró' })).toBeVisible({
    timeout: 15_000,
  });
  expect(unlinks).toEqual(['DELETE']);
  await page.getByRole('button', { name: 'Listo' }).click();

  await signIn(page, email);
  await expect(page.getByRole('button', { name: 'Crear mi primera cuenta' })).toBeVisible();
  await expect(page.getByText('Efectivo')).toHaveCount(0);
});
