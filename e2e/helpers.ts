import { expect, type Page } from '@playwright/test';

/**
 * Inicia sesión con un usuario nuevo del emulador de Auth. No usa el popup de Google: con el
 * emulador, a veces queda colgado. La app expone `e2eSignIn` solo en el build de emulador
 * (ADR 0019). Cada test usa un usuario nuevo, así no dependen entre sí.
 */
export async function signIn(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
  const email = `persona-${String(Date.now())}-${String(Math.random()).slice(2, 8)}@example.com`;
  await page.evaluate(
    ([e, name]) => window.e2eSignIn?.(e ?? '', name ?? ''),
    [email, 'Persona Prueba'],
  );
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
}

/** Crea una cuenta en pesos desde Inicio. */
export async function createAccount(page: Page, name: string, initialBalance: string) {
  await page
    .getByRole('button', { name: /^(\+ Agregar|Crear mi primera cuenta)$/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await sheet.getByLabel('Nombre').fill(name);
  await sheet.getByLabel('Saldo inicial').fill(initialBalance);
  await sheet.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(sheet).toBeHidden();
}

/** Carga un gasto con el teclado de la pantalla. */
export async function addExpense(page: Page, account: string, amount: string, category: string) {
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await sheet.getByLabel('Cuenta').selectOption({ label: `${account} · ARS` });
  for (const key of amount) {
    await sheet.getByRole('button', { name: key, exact: true }).click();
  }
  await sheet.getByRole('button', { name: category }).click();
  await sheet.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(sheet).toBeHidden();
}
