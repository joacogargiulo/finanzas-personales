import { expect, test } from '@playwright/test';
import { addExpense, createAccount, signIn } from './helpers';

// Presupuestos (SRS 5.9): se crean en Ajustes y en Inicio muestran cuánto se gastó en el mes,
// con la barra en amarillo desde el 80 % (TC-15).
test('presupuesto de Comida con el 85 % gastado (TC-15)', async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Efectivo', '200000');

  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: '+ Añadir presupuesto' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo presupuesto' });
  await sheet.getByRole('button', { name: 'Comida' }).click();
  await sheet.getByLabel(/^Límite por mes/).fill('100000');
  await sheet.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Presupuestos' }).getByText('$ 100.000,00'),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Inicio' }).click();
  await addExpense(page, 'Efectivo', '85000', 'Comida');

  const budgets = page.getByRole('region', { name: /^Presupuestos de/ });
  await expect(
    budgets.getByRole('progressbar', { name: 'Comida: cerca del límite' }),
  ).toHaveAttribute('aria-valuenow', '85');
  await expect(budgets.getByText('85 %')).toBeVisible();
});
