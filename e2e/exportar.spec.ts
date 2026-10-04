import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { addExpense, createAccount, signIn } from './helpers';

// Respaldo y exportación (SRS 8.1 y 8.3): los archivos se arman con los datos del dispositivo
// y el navegador los descarga. Playwright atrapa la descarga y el test lee el archivo.

async function download(page: Page, button: string): Promise<{ file: Download; data: Buffer }> {
  const card = page.getByRole('region', { name: 'Respaldo y exportación' });
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: button }).click(),
  ]);
  return { file, data: await readFile(await file.path()) };
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await createAccount(page, 'Efectivo', '10000');
  await addExpense(page, 'Efectivo', '2500', 'Comida');
  await page.getByRole('link', { name: 'Ajustes' }).click();
});

test('TC-23 adaptado: el respaldo JSON trae lo cargado', async ({ page }) => {
  const { file, data } = await download(page, 'Descargar respaldo (JSON)');

  expect(file.suggestedFilename()).toMatch(/^finanzas_\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(data.toString('utf-8')) as {
    format: string;
    accounts: { name: string; initialBalance: number }[];
    categories: unknown[];
    transactions: { amount: number }[];
  };
  expect(backup.format).toBe('control-finanzas');
  expect(backup.accounts).toMatchObject([{ name: 'Efectivo', initialBalance: 10_000_00 }]);
  // Las 6 categorías iniciales (SRS 4.7).
  expect(backup.categories).toHaveLength(6);
  expect(backup.transactions).toMatchObject([{ amount: 2500_00 }]);
});

test('TC-22: la planilla es un ZIP con los CSV para Excel', async ({ page }) => {
  const { file, data } = await download(page, 'Descargar planilla (CSV)');

  expect(file.suggestedFilename()).toMatch(/^finanzas_\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipSync(new Uint8Array(data));
  expect(Object.keys(files).sort()).toEqual(['categorias.csv', 'cuentas.csv', 'movimientos.csv']);

  // `ignoreBOM` deja el BOM en el texto, para comprobar que está.
  const decode = (name: string) =>
    new TextDecoder('utf-8', { ignoreBOM: true }).decode(files[name]);
  expect(decode('cuentas.csv')).toBe(
    '﻿Nombre;Moneda;Saldo inicial;Saldo actual;Estado\r\n' +
      'Efectivo;ARS;10000,00;7500,00;Activa\r\n',
  );
  expect(decode('movimientos.csv')).toMatch(/;Gasto;Efectivo;;Comida;;2500,00;ARS;;\r\n$/);
});
