import { expect, test } from '@playwright/test';
import { createAccount, signIn } from './helpers';

// Dictado (ADR 0023). El navegador de los tests no tiene micrófono: antes de cargar la página se
// instala un `webkitSpeechRecognition` falso que, al empezar a escuchar, "oye" una frase fija.

const PHRASE = 'gasté dieciocho mil en el súper con efectivo';

test('dictar un gasto desde la dirección del atajo (dictar=1)', async ({ page }) => {
  await page.addInitScript((phrase) => {
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
          this.onresult?.({ results: [[{ transcript: phrase }]] });
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
  }, PHRASE);

  await signIn(page);
  await createAccount(page, 'Efectivo', '50000');
  // El usuario es nuevo: se espera a que lleguen las categorías iniciales (SRS 4.7), para que
  // el dictado encuentre "súper" → Comida. La siembra espera la respuesta del servidor y, con
  // varios tests en paralelo contra el emulador, puede tardar más que los 5 s por defecto.
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByText('Comida', { exact: true })).toBeVisible({ timeout: 20_000 });

  // La dirección del atajo "Dictar movimiento" (Fase 7): el panel abre escuchando.
  await page.evaluate(() => {
    location.hash = '#/inicio?movimiento=nuevo&dictar=1';
  });
  const sheet = page.getByRole('dialog', { name: 'Nuevo movimiento' });
  await expect(sheet.getByText(`Escuché: «${PHRASE}»`)).toBeVisible();

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
