import type { Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { addExpense, createAccount, signIn } from './helpers';

// Exportar a Google Sheets (SRS 8.4, ADR 0025) sin hablar con Google de verdad:
// - el script de Google Identity Services se reemplaza por uno vacío, y un `google.accounts`
//   falso entrega el token como si la persona hubiera aceptado el permiso;
// - las APIs de Sheets y Drive las responde el test, que además cuenta qué se pidió.

const SPREADSHEET = {
  spreadsheetId: 'hoja-e2e',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/hoja-e2e',
  sheets: ['Cuentas', 'Categorías', 'Movimientos'].map((title, index) => ({
    properties: { sheetId: index, title, gridProperties: { rowCount: 1000 } },
  })),
};

// La app llama a otro dominio con un token: el navegador primero pregunta si puede (CORS).
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST',
};

function reply(route: Route, body: unknown) {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  return route.fulfill({ status: 200, headers: CORS, json: body });
}

test('exportar a Sheets crea la hoja una vez y después la actualiza', async ({ page }) => {
  const google = { creates: 0, batchUpdates: [] as string[] };

  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.route('https://www.googleapis.com/drive/v3/files/**', (route) =>
    reply(route, { trashed: false }),
  );
  await page.route('https://sheets.googleapis.com/**', (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.url().endsWith(':batchUpdate')) {
      google.batchUpdates.push(request.postData() ?? '');
      return reply(route, { replies: [] });
    }
    if (request.method() === 'POST') google.creates += 1;
    return reply(route, SPREADSHEET);
  });

  await page.addInitScript(() => {
    const counter = window as unknown as { tokenRequests: number };
    counter.tokenRequests = 0;
    Object.assign(window, {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (config: { callback: (response: object) => void }) => ({
              requestAccessToken: () => {
                counter.tokenRequests += 1;
                setTimeout(() => {
                  config.callback({ access_token: 'token-e2e', expires_in: 3600 });
                }, 50);
              },
            }),
            hasGrantedAllScopes: () => true,
          },
        },
      },
    });
  });

  await signIn(page);
  await createAccount(page, 'Efectivo', '10000');
  await addExpense(page, 'Efectivo', '2500', 'Comida');
  await page.getByRole('link', { name: 'Ajustes' }).click();
  // El ID de la hoja se guarda en el perfil, que existe recién después de la siembra (SRS 4.7).
  await expect(page.getByText('Comida', { exact: true })).toBeVisible({ timeout: 20_000 });

  const card = page.getByRole('region', { name: 'Respaldo y exportación' });
  const exportButton = card.getByRole('button', { name: 'Exportar a Google Sheets' });

  await exportButton.click();
  await expect(card.getByRole('link', { name: 'Abrir la hoja' })).toHaveAttribute(
    'href',
    SPREADSHEET.spreadsheetUrl,
  );
  await expect(card.getByRole('status')).toContainText('Exportado el');
  expect(google.creates).toBe(1);
  expect(google.batchUpdates).toHaveLength(1);
  expect(google.batchUpdates[0]).toContain('"numberValue":2500');

  // La segunda vez usa la hoja guardada en el perfil y el mismo token (sin otro popup).
  await exportButton.click();
  await expect.poll(() => google.batchUpdates.length).toBe(2);
  expect(google.creates).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { tokenRequests: number }).tokenRequests),
  ).toBe(1);
});
