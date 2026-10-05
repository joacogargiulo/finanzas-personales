// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { forgetSheetsToken, requestSheetsToken, SHEETS_SCOPE } from './googleToken';

// Google Identity Services se reemplaza por uno falso en `window.google`: cada test decide qué
// le "responde" el popup a la app.

interface FakeResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

function installGoogle(answer: FakeResponse | { popupError: string }, granted = true) {
  const configs: { login_hint?: string; scope: string }[] = [];
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => {
          configs.push(config);
          return {
            requestAccessToken: () => {
              if ('popupError' in answer) config.error_callback?.({ type: answer.popupError });
              else config.callback(answer);
            },
          };
        },
        hasGrantedAllScopes: () => granted,
      },
    },
  };
  return configs;
}

afterEach(() => {
  forgetSheetsToken();
  delete window.google;
});

describe('requestSheetsToken', () => {
  it('pide solo el permiso de Drive, sugiere la cuenta y devuelve el token', async () => {
    const configs = installGoogle({ access_token: 'abc', expires_in: 3600 });
    await expect(requestSheetsToken('persona@example.com')).resolves.toBe('abc');
    expect(configs[0]).toMatchObject({ scope: SHEETS_SCOPE, login_hint: 'persona@example.com' });
  });

  // Mientras el token no venció, la segunda exportación no vuelve a abrir el popup.
  it('reutiliza el token vigente del mismo usuario', async () => {
    const configs = installGoogle({ access_token: 'abc', expires_in: 3600 });
    await requestSheetsToken('persona@example.com');
    await requestSheetsToken('persona@example.com');
    expect(configs).toHaveLength(1);
  });

  it('pide uno nuevo si el guardado venció', async () => {
    const configs = installGoogle({ access_token: 'abc', expires_in: 3600 });
    let now = 0;
    await requestSheetsToken('persona@example.com', () => now);
    now = 3_600_000;
    await requestSheetsToken('persona@example.com', () => now);
    expect(configs).toHaveLength(2);
  });

  // Cada forma de "no" de Google termina en un código que la pantalla sabe explicar.
  it('sin el script de Google cargado → notReady', async () => {
    await expect(requestSheetsToken(null)).rejects.toMatchObject({ code: 'notReady' });
  });

  it('si la persona rechaza el permiso → denied', async () => {
    installGoogle({ error: 'access_denied' });
    await expect(requestSheetsToken(null)).rejects.toMatchObject({ code: 'denied' });
  });

  it('si destilda el permiso de Drive → denied', async () => {
    installGoogle({ access_token: 'abc', expires_in: 3600 }, false);
    await expect(requestSheetsToken(null)).rejects.toMatchObject({ code: 'denied' });
  });

  it('si cierra el popup → popup', async () => {
    installGoogle({ popupError: 'popup_closed' });
    await expect(requestSheetsToken(null)).rejects.toMatchObject({ code: 'popup' });
  });
});
