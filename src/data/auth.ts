// Inicio y cierre de sesión con Google (SRS 6.1, 7.1, 7.2, ADR 0017).

import { FirebaseError } from 'firebase/app';
import {
  deleteUser,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import { clearIndexedDbPersistence, terminate, type Firestore } from 'firebase/firestore';
import { needsReauth } from '../domain/accountDeletion';

/** Los datos del usuario de Google que muestra la app. */
export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
}

export type SignInResult =
  | { ok: true }
  /** `cancelled`: el usuario cerró el popup; no hay que mostrar ningún error. */
  | { ok: false; reason: 'cancelled' | 'offline' | 'unknown'; error?: unknown };

function toSessionUser(user: User): SessionUser {
  return { uid: user.uid, displayName: user.displayName, email: user.email };
}

function errorCode(error: unknown): string | null {
  return error instanceof FirebaseError ? error.code : null;
}

function failure(error: unknown): SignInResult {
  switch (errorCode(error)) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return { ok: false, reason: 'cancelled' };
    case 'auth/network-request-failed':
      return { ok: false, reason: 'offline' };
    default:
      return { ok: false, reason: 'unknown', error };
  }
}

/** Avisa cada vez que cambia la sesión (también al abrir la app, con la sesión guardada). */
export function watchUser(auth: Auth, callback: (user: SessionUser | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    callback(user ? toSessionUser(user) : null);
  });
}

/**
 * Popup y, si el navegador lo bloquea, redirect (ADR 0017). Con el redirect la página se va a
 * Google y vuelve recargada: el resultado se lee con `checkRedirectResult` al abrir la app.
 */
export async function signInWithGoogle(auth: Auth): Promise<SignInResult> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-environment') {
      try {
        await signInWithRedirect(auth, provider);
        return { ok: true };
      } catch (redirectError) {
        return failure(redirectError);
      }
    }
    return failure(error);
  }
}

/** Si la app vuelve de un redirect que falló, devuelve el error para mostrarlo. */
export async function checkRedirectResult(auth: Auth): Promise<SignInResult> {
  try {
    await getRedirectResult(auth);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Cierra la sesión y borra la caché local (SRS 7.2): nadie que use después este dispositivo
 * puede ver los datos. Las escrituras pendientes se pierden, así que la UI avisa antes.
 * Después de esto la instancia de Firestore queda inutilizable: la app se recarga.
 */
export async function signOutAndClear(auth: Auth, db: Firestore): Promise<void> {
  await firebaseSignOut(auth);
  await clearLocalCache(db);
}

/** Borra la caché de Firestore del dispositivo. La instancia queda inutilizable. */
export async function clearLocalCache(db: Firestore): Promise<void> {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}

/**
 * Para borrar el usuario de Auth, Firebase exige un inicio de sesión reciente (ADR 0030).
 * Si el último tiene más de 4 minutos, se pide de nuevo con el popup de Google y, si el navegador
 * lo bloquea, con un redirect (ADR 0017): en ese caso devuelve `'redirecting'` y la página se va.
 * Al volver, el inicio de sesión ya es reciente y no se vuelve a pedir.
 */
export async function ensureRecentLogin(
  auth: Auth,
  now: () => number = Date.now,
): Promise<'ready' | 'redirecting'> {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay sesión');
  const { authTime } = await user.getIdTokenResult();
  if (!needsReauth(Date.parse(authTime), now())) return 'ready';

  const provider = new GoogleAuthProvider();
  // Sugiere la misma cuenta; si se elige otra, Firebase responde "auth/user-mismatch".
  provider.setCustomParameters(user.email ? { login_hint: user.email } : {});
  try {
    await reauthenticateWithPopup(user, provider);
    return 'ready';
  } catch (error) {
    const code = errorCode(error);
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-environment') {
      await reauthenticateWithRedirect(user, provider);
      return 'redirecting';
    }
    throw error;
  }
}

/** Borra el usuario de Firebase Auth (no la cuenta de Google). Firebase cierra la sesión. */
export async function deleteCurrentUser(auth: Auth): Promise<void> {
  if (!auth.currentUser) throw new Error('No hay sesión');
  await deleteUser(auth.currentUser);
}

/**
 * Solo para los tests E2E con el emulador de Auth (ADR 0019): inicia sesión con una cuenta de
 * Google inventada, sin el popup. El emulador acepta un "token" que es un JSON sin firmar; el
 * servicio real de Google lo rechazaría.
 */
export async function signInForTests(auth: Auth, email: string, displayName: string) {
  const fakeIdToken = JSON.stringify({
    sub: email,
    email,
    email_verified: true,
    name: displayName,
  });
  await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
}
