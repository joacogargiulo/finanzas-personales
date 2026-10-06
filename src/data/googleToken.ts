// Permiso de Google para exportar a Sheets, con Google Identity Services (SRS 8.4, ADR 0025).
//
// Es aparte del login de Firebase: el login dice quién sos; este token deja que la app cree y
// edite su propia hoja en tu Drive (scope `drive.file`) y nada más. Se pide recién al exportar.
//
// El popup de Google tiene que abrirse durante el toque del botón: si antes hay una espera (por
// ejemplo, descargar el script), el navegador lo bloquea. Por eso el script se precarga al
// mostrar la tarjeta y `requestSheetsToken` llama a Google sin esperar nada antes.

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
/** Margen para no usar un token que vence mientras se exporta. */
const EXPIRY_MARGIN_MS = 60_000;

/** Qué salió mal al hablar con Google; la pantalla elige el mensaje. */
export type GoogleErrorCode =
  | 'notReady' // el script de Google todavía no cargó
  | 'popup' // el popup no se pudo abrir o se cerró
  | 'denied' // el usuario no dio el permiso
  | 'auth' // el token venció o se revocó
  | 'network' // sin conexión
  | 'google'; // otra respuesta de error de Google

export class GoogleError extends Error {
  readonly code: GoogleErrorCode;
  constructor(code: GoogleErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'GoogleError';
    this.code = code;
  }
}

// Tipos mínimos de la parte de Google Identity Services que se usa (no hace falta instalar @types).
interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  login_hint?: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: TokenClientConfig) => { requestAccessToken: () => void };
  hasGrantedAllScopes: (response: TokenResponse, scope: string) => boolean;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

/** El Client ID web del proyecto (`VITE_GOOGLE_CLIENT_ID`). Sin él, no se ofrece Sheets. */
export function googleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
}

let loading: Promise<void> | null = null;

/** Carga el script de Google una sola vez. Si falla (sin conexión), se puede volver a intentar. */
export function loadGoogleIdentity(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new GoogleError('network', 'no se pudo cargar el script de Google'));
    };
    document.head.append(script);
  });
  return loading;
}

/** El último token, para no abrir el popup en cada exportación. Solo en memoria. */
let cached: { token: string; email: string | null; expiresAt: number } | null = null;

/** Olvida el token (por ejemplo, si Google respondió que venció). */
export function forgetSheetsToken(): void {
  cached = null;
}

/**
 * Pide un token para Sheets. Si hay uno vigente del mismo usuario, lo devuelve sin popup.
 * Hay que llamarla directo desde el click, sin `await` antes (ver el comentario de arriba).
 * `email` sugiere a Google la cuenta con la que se inició sesión (`login_hint`).
 */
export function requestSheetsToken(email: string | null, now = Date.now): Promise<string> {
  if (cached && cached.email === email && cached.expiresAt > now()) {
    return Promise.resolve(cached.token);
  }
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return Promise.reject(new GoogleError('notReady'));

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: googleClientId(),
      scope: SHEETS_SCOPE,
      ...(email ? { login_hint: email } : {}),
      callback: (response) => {
        // Con el consentimiento por partes, la persona puede destildar el permiso de Drive y
        // Google igual devuelve un token: hay que comprobar que lo dio.
        if (
          response.error ||
          !response.access_token ||
          !oauth2.hasGrantedAllScopes(response, SHEETS_SCOPE)
        ) {
          reject(new GoogleError('denied', response.error));
          return;
        }
        const expiresIn = Number(response.expires_in ?? 0) * 1000;
        cached = {
          token: response.access_token,
          email,
          expiresAt: now() + expiresIn - EXPIRY_MARGIN_MS,
        };
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new GoogleError('popup', error.type));
      },
    });
    client.requestAccessToken();
  });
}
