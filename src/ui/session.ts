// Instancias únicas de la app: Firebase, el store, la sesión y las actualizaciones. La UI las
// importa desde acá.

import { registerSW } from 'virtual:pwa-register';
import { startAppUpdates } from '../data/appUpdate';
import { signInForTests } from '../data/auth';
import { createInterpreter } from '../data/dictation';
import { initFirebase } from '../data/firebase';
import { startRates } from '../data/rates';
import { startSession } from '../data/session';
import { createDataStore } from '../data/store';

export const store = createDataStore();
const services = initFirebase();
export const session = startSession(services, store);

// Solo con los emuladores: los tests E2E inician sesión sin el popup de Google (ADR 0019).
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  window.e2eSignIn = (email, displayName) => signInForTests(services.auth, email, displayName);
}

// Dictado (ADR 0031): con conexión, la IA del Worker; si no, el parser de reglas.
export const interpretDictation = createInterpreter({
  url: import.meta.env.VITE_DICTATION_URL || null,
  getToken: () => services.auth.currentUser?.getIdToken() ?? Promise.resolve(null),
  fetch: (...args) => window.fetch(...args),
  isOnline: () => navigator.onLine,
});

// Cotizaciones del dólar y el euro blue (SRS 5.8): no dependen de la sesión.
startRates(store);

// Service worker: la app abre sin conexión y avisa cuando hay una versión nueva (ADR 0027).
export const appUpdates = startAppUpdates(store, registerSW);
