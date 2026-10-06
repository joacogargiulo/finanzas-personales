import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createAccount, signIn } from './helpers';

// Dictado (ADR 0023 y 0031). El navegador de los tests no tiene micrófono: antes de cargar la
// página se instala un `webkitSpeechRecognition` falso que, al empezar a escuchar, "oye" una
// frase fija. El Worker de la IA tampoco existe: Playwright responde en su lugar
// (`VITE_DICTATION_URL` apunta a https://dictado.invalid en el modo emulador).

const PHRASE = 'gasté dieciocho mil en el súper con efectivo';
const WORKER = 'https://dictado.invalid/interpretar';

async function installSpeech(page: Page, phrase: string) {
  await page.addInitScript((text) => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: text }]] });
          this.onend?.();
        }, 300);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend = null;
      }
    }
    // Chromium trae los dos nombres: se reemplazan ambos.
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
  }, phrase);
}

/** Espera las categorías iniciales (SRS 4.7): la siembra puede tardar con varios tests en paralelo. */
async function waitForSeed(page: Page) {
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByText('Comida', { exact: true })).toBeVisible({ timeout: 20_000 });
}

// Con el Worker caído, el dictado sigue funcionando con el parser de reglas (TC-33).
test('dictar un gasto desde la dirección del atajo (dictar=1), sin IA', async ({ page }) => {
  await installSpeech(page, PHRASE);
  await page.route(WORKER, (route) => route.abort());

  await signIn(page);
  await createAccount(page, 'Efectivo', '50000');
  // Para que el dictado encuentre "súper" → Comida.
  await waitForSeed(page);

  // La dirección del atajo "Dictar movimiento" (Fase 7): el panel abre escuchando.
  await page.evaluate(() => {
    location.hash = '#/inicio?movimiento=nuevo&dictar=1';
  });
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await expect(sheet.getByText(`Escuché: «${PHRASE}»`)).toBeVisible();
  await expect(sheet.getByText(/La IA no respondió: se interpretó sin IA/)).toBeVisible();

  // Precargó todo, pero no guardó: espera a que el usuario toque Guardar.
  await expect(sheet.getByLabel(/^Monto:/)).toHaveText('− $ 18.000');
  await expect(sheet.getByRole('button', { name: 'Comida' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await sheet.getByRole('button', { name: 'Guardar gasto' }).click();
  await expect(sheet).toBeHidden();

  const recent = page.getByRole('region', { name: 'Últimos movimientos' });
  await expect(recent.getByText('− $ 18.000,00')).toBeVisible();
});

// Con la IA, también se dicta un cambio de moneda (TC-32). Playwright hace de Worker: revisa
// que llegue el token y responde lo que diría el modelo, con los IDs reales de las cuentas.
test('dictar un cambio de moneda con la IA', async ({ page }) => {
  const phrase = 'compré 100 dólares a 1300';
  await installSpeech(page, phrase);
  await page.route(WORKER, async (route) => {
    const cors = {
      'Access-Control-Allow-Origin': 'http://localhost:4173',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    expect(route.request().headers()['authorization']).toMatch(/^Bearer .+/);
    const body = route.request().postDataJSON() as {
      accounts: { id: string; currency: string }[];
    };
    const peso = body.accounts.find((a) => a.currency === 'ARS');
    const dollar = body.accounts.find((a) => a.currency === 'USD');
    await route.fulfill({
      headers: cors,
      json: {
        result: {
          type: 'exchange',
          amount: '130000',
          toAmount: '100',
          currency: 'ARS',
          date: null,
          accountId: peso?.id ?? null,
          toAccountId: dollar?.id ?? null,
          categoryId: null,
          description: 'Dólares',
        },
      },
    });
  });

  await signIn(page);
  await createAccount(page, 'Efectivo', '500000');
  await page
    .getByRole('button', { name: /^(\+ Agregar|Crear mi primera cuenta)$/ })
    .first()
    .click();
  const accountSheet = page.getByRole('dialog', { name: 'Nueva cuenta' });
  await accountSheet.getByLabel('Nombre').fill('Caja dólares');
  await accountSheet.getByRole('button', { name: 'USD' }).click();
  await accountSheet.getByLabel('Saldo inicial').fill('0');
  await accountSheet.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(accountSheet).toBeHidden();

  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await sheet.getByRole('button', { name: 'Dictar movimiento' }).click();
  await expect(sheet.getByText(`Escuché: «${phrase}»`)).toBeVisible();

  await expect(sheet.getByRole('button', { name: 'Cambio', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.getByRole('button', { name: /^Sale/ })).toContainText('$ 130.000');
  await expect(sheet.getByRole('button', { name: /^Entra/ })).toContainText('US$ 100');
  await sheet.getByRole('button', { name: 'Guardar cambio' }).click();
  await expect(sheet).toBeHidden();
});
