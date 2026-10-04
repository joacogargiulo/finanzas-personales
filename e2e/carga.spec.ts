import { expect, test, type Page } from '@playwright/test';

// Flujo completo contra los emuladores de Auth y Firestore (ADR 0019): una persona nueva entra,
// crea su primera cuenta y carga un gasto (TC-01). Cada test usa un navegador limpio y un
// usuario nuevo, así no dependen entre sí.

/**
 * Inicia sesión con un usuario nuevo del emulador de Auth. No usa el popup de Google: con el
 * emulador, a veces queda colgado. La app expone `e2eSignIn` solo en el build de emulador.
 */
async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
  const email = `persona-${String(Date.now())}-${String(Math.random()).slice(2, 8)}@example.com`;
  await page.evaluate(
    ([e, name]) => window.e2eSignIn?.(e ?? '', name ?? ''),
    [email, 'Persona Prueba'],
  );
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
}

test('crear la primera cuenta y cargar un gasto (TC-01)', async ({ page }) => {
  await signIn(page);

  // Estado vacío: invita a crear la primera cuenta.
  await page.getByRole('button', { name: 'Crear mi primera cuenta' }).click();
  const accountSheet = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await accountSheet.getByLabel('Nombre').fill('Efectivo');
  await accountSheet.getByLabel('Saldo inicial').fill('2000');
  await accountSheet.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(accountSheet).toBeHidden();

  const accounts = page.getByRole('region', { name: 'Cuentas' });
  await expect(accounts.getByText('$ 2.000,00')).toBeVisible();

  // Gasto de $500 con el teclado de la pantalla.
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  for (const key of ['5', '0', '0']) {
    await sheet.getByRole('button', { name: key, exact: true }).click();
  }
  // Las categorías iniciales llegan con la siembra (SRS 4.7).
  await sheet.getByRole('button', { name: 'Comida' }).click();
  await sheet.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(sheet).toBeHidden();

  // El saldo se actualiza sin esperar al servidor, y el gasto aparece en rojo con signo.
  await expect(accounts.getByText('$ 1.500,00')).toBeVisible();
  const recent = page.getByRole('region', { name: 'Últimos movimientos' });
  await expect(recent.getByText('− $ 500,00')).toBeVisible();
});

test('el botón Atrás cierra el panel en vez de salir de la pantalla', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await expect(page.getByRole('dialog', { name: 'Nuevo movimiento' })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
});
