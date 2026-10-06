// Actualización de la app instalada (SRS 9.1, ADR 0027).
//
// El service worker guarda una copia de la app para abrirla sin conexión. Cuando se publica una
// versión nueva, el navegador la descarga en segundo plano y queda "esperando": la app avisa
// "Hay una versión nueva" y se actualiza recién cuando la persona toca Actualizar. Así nunca se
// recarga sola en medio de una carga. Las escrituras pendientes no se pierden: viven en IndexedDB.

import type { DataStore } from './store';

/** Cada cuánto se pregunta si hay una versión nueva, con la app abierta. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Lo que usamos de `registerSW` de vite-plugin-pwa (se recibe por parámetro para los tests). */
export type RegisterSW = (options: {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}) => (reloadPage?: boolean) => Promise<void>;

export interface AppUpdates {
  /** Activa la versión nueva y recarga la página. */
  apply: () => void;
}

export interface AppUpdateDeps {
  isOnline: () => boolean;
  setInterval: (callback: () => void, ms: number) => unknown;
}

const browserDeps: AppUpdateDeps = {
  isOnline: () => navigator.onLine,
  setInterval: (callback, ms) => window.setInterval(callback, ms),
};

export function startAppUpdates(
  store: DataStore,
  registerSW: RegisterSW,
  deps: AppUpdateDeps = browserDeps,
): AppUpdates {
  const updateSW = registerSW({
    onNeedRefresh: () => {
      store.setState({ updateAvailable: true });
    },
    // El navegador solo busca versiones nuevas al abrir la app. Una PWA puede quedar abierta
    // días, así que se pregunta cada hora (si hay conexión).
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      deps.setInterval(() => {
        if (deps.isOnline()) void registration.update();
      }, UPDATE_CHECK_MS);
    },
    onRegisterError: (error) => {
      console.error('No se pudo registrar el service worker', error);
    },
  });

  return {
    apply: () => {
      void updateSW(true);
    },
  };
}
