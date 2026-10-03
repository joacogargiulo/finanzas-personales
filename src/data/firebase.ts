// Inicialización de Firebase (SRS 3.3, punto 4). Es el único archivo que lee la configuración.

import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  CACHE_SIZE_UNLIMITED,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

/** `npm run dev:emu` usa los emuladores locales en vez del proyecto real (`.env.emulators`). */
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

// Con los emuladores alcanza con un proyecto "demo-": no hace falta ninguna clave real.
const EMULATOR_CONFIG: FirebaseOptions = {
  apiKey: 'demo-key',
  authDomain: 'localhost',
  projectId: 'demo-finanzas',
};

function readConfig(): FirebaseOptions {
  const missing: string[] = [];
  const read = (key: `VITE_FIREBASE_${string}`): string => {
    const value: string | undefined = import.meta.env[key] as string | undefined;
    if (!value) missing.push(key);
    return value ?? '';
  };
  const config = {
    apiKey: read('VITE_FIREBASE_API_KEY'),
    authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: read('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: read('VITE_FIREBASE_APP_ID'),
  };
  if (missing.length > 0) {
    throw new Error(
      `Falta la configuración de Firebase en .env.local (${missing.join(', ')}). ` +
        'Copiá .env.example o usá `npm run dev:emu` para trabajar con los emuladores.',
    );
  }
  return config;
}

export function initFirebase(): FirebaseServices {
  const app = initializeApp(useEmulators ? EMULATOR_CONFIG : readConfig());
  const auth = getAuth(app);
  // Caché persistente (IndexedDB), compartida entre pestañas y sin límite de tamaño:
  // la sincronización incremental necesita que la caché no descarte documentos (ADR 0003).
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    }),
  });
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  return { app, auth, db };
}
