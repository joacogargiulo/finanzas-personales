import { expect, test, type Page } from '@playwright/test';
import { addExpense, createAccount, signIn } from './helpers';

// Estadísticas y buscador (Fase 4) contra los emuladores: los datos cargados se ven en los
// gráficos sin pedir nada más a Firestore.

async function addIncome(page: Page, amount: string, category: string) {
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await sheet.getByRole('button', { name: 'Ingreso', exact: true }).click();
  for (const key of amount) {
    await sheet.getByRole('button', { name: key, exact: true }).click();
  }
  await sheet.getByRole('button', { name: category }).click();
  await sheet.getByRole('button', { name: 'Guardar ingreso' }).click();
  await expect(sheet).toBeHidden();
}

test('los movimientos cargados aparecen en Estadísticas', async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Efectivo', '1000');
  await addIncome(page, '2000', 'Salario');
  await addExpense(page, 'Efectivo', '500', 'Comida');

  await page.getByRole('link', { name: 'Estadísticas' }).click();
  const summary = page.getByRole('region', { name: 'Resumen del período' });
  await expect(summary.getByText('+ $ 2.000,00')).toBeVisible();
  await expect(summary.getByText('− $ 500,00')).toBeVisible();
  await expect(summary.getByText('+ $ 1.500,00')).toBeVisible();

  const expenses = page.getByRole('list', { name: 'Gastos por categoría' });
  await expect(expenses.getByRole('listitem')).toHaveCount(1);
  await expect(expenses).toContainText('Comida');
  await expect(expenses).toContainText('100 %');

  // Otro período: "Este mes" sigue incluyendo lo cargado hoy.
  await page.getByRole('button', { name: 'Este mes' }).click();
  await expect(summary.getByText('− $ 500,00')).toBeVisible();
});

test('buscar sin acentos y cerrar Filtros con Atrás', async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Tarjeta de Crédito', '1000');
  await addExpense(page, 'Tarjeta de Crédito', '300', 'Comida');

  await page.getByRole('link', { name: 'Movimientos' }).click();
  const search = page.getByLabel('Buscar movimientos');
  await search.fill('credito');
  await expect(page.getByText('− $ 300,00').first()).toBeVisible();
  await search.fill('zapatillas');
  await expect(page.getByText('No hay movimientos que coincidan con “zapatillas”.')).toBeVisible();

  // El panel de Filtros se cierra con Atrás y la pantalla sigue en Movimientos.
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
});
