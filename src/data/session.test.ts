import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProfile, deleteUserDocs } from './accountDeletion';
import { deleteCurrentUser, watchUser, type SessionUser } from './auth';
import type { FirebaseServices } from './firebase';
import { startSession } from './session';
import { createDataStore } from './store';
import { WhatsAppLinkError } from './whatsappLink';

// "Borrar mi cuenta" y el vínculo de WhatsApp (ADR 0030 y 0033): Firebase, la sincronización y
// los borrados se reemplazan por funciones falsas que solo registran en qué orden se llamaron.

const calls: string[] = [];
let signIn: (user: SessionUser | null) => void = () => undefined;

vi.mock('./auth', () => ({
  watchUser: vi.fn(),
  checkRedirectResult: vi.fn(() => Promise.resolve({ ok: true })),
  ensureRecentLogin: vi.fn(() => Promise.resolve('ok')),
  deleteCurrentUser: vi.fn(() => {
    calls.push('deleteUser');
    return Promise.resolve();
  }),
  clearLocalCache: vi.fn(() => Promise.resolve()),
  signInWithGoogle: vi.fn(),
  signOutAndClear: vi.fn(),
}));
vi.mock('./accountDeletion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./accountDeletion')>()),
  deleteUserDocs: vi.fn(() => {
    calls.push('deleteDocs');
    return Promise.resolve();
  }),
  deleteProfile: vi.fn(() => {
    calls.push('deleteProfile');
    return Promise.resolve();
  }),
}));
vi.mock('./sync', () => ({ startSync: vi.fn(() => vi.fn()), isPermissionDenied: () => false }));
vi.mock('./writes', () => ({ createWriter: vi.fn(() => ({})) }));
vi.mock('./seed', () => ({ ensureSeeded: vi.fn(() => Promise.resolve()) }));
vi.mock('./preferences', () => ({ clearPreferences: vi.fn() }));

const services = {} as FirebaseServices;

function signedInSession(unlinkWhatsApp?: () => Promise<void>) {
  const store = createDataStore();
  const session = startSession(services, store, { unlinkWhatsApp });
  signIn({ uid: 'ana', displayName: 'Ana', email: 'ana@example.org' });
  store.setState({ sync: { pendingWrites: false, upToDate: true } });
  return { store, session };
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  vi.mocked(watchUser).mockImplementation((_auth, callback) => {
    signIn = callback;
    return () => undefined;
  });
});

describe('borrar la cuenta con WhatsApp', () => {
  it('desvincula WhatsApp antes de borrar cualquier dato', async () => {
    const unlink = vi.fn(() => {
      calls.push('unlink');
      return Promise.resolve();
    });
    const { store, session } = signedInSession(unlink);
    await session.deleteAccount();

    expect(calls).toEqual(['unlink', 'deleteDocs', 'deleteProfile', 'deleteUser']);
    expect(store.getState().accountDeletion).toEqual({ phase: 'done' });
  });

  // Si quedara el vínculo, el bot podría escribir en una cuenta que ya no existe.
  it('si no puede desvincular, no borra nada y lo dice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, session } = signedInSession(() =>
      Promise.reject(new WhatsAppLinkError('failed')),
    );
    await session.deleteAccount();

    expect(deleteUserDocs).not.toHaveBeenCalled();
    expect(deleteProfile).not.toHaveBeenCalled();
    expect(deleteCurrentUser).not.toHaveBeenCalled();
    expect(store.getState().accountDeletion).toEqual({ phase: 'error', failure: 'whatsapp' });
  });

  it('sin Worker configurado, borra igual', async () => {
    const { session } = signedInSession();
    await session.deleteAccount();
    expect(calls).toEqual(['deleteDocs', 'deleteProfile', 'deleteUser']);
  });
});
