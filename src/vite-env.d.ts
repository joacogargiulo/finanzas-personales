/// <reference types="vite/client" />

// Variables de entorno que usa la app (ver .env.example). Vite solo expone las que empiezan con VITE_.
interface ImportMetaEnv {
  readonly VITE_USE_EMULATORS?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** Client ID web de Google para exportar a Sheets (ADR 0025). Sin él, no se ofrece Sheets. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Solo en el build de emulador (tests E2E): inicia sesión sin el popup (ADR 0019). */
  e2eSignIn?: (email: string, displayName: string) => Promise<void>;
}
