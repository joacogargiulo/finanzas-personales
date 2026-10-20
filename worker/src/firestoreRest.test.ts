import { describe, expect, it, vi } from 'vitest';
import { whatsappTransactionDoc } from '../../src/domain/whatsapp';
import {
  createTransaction,
  decodeDocument,
  decodeValue,
  encodeValue,
  FirestoreError,
  readUserContext,
} from './firestoreRest';

// La REST de Firestore (ADR 0034), con un `fetch` falso: cómo viajan los valores con tipo, qué se
// pide para leer el perfil y cómo se escribe un movimiento.

const PROJECT = 'proyecto-test';
const config = (fetch: typeof globalThis.fetch) => ({ projectId: PROJECT, fetch });

describe('valores con tipo', () => {
  it('los enteros viajan como texto y nunca como decimales', () => {
    expect(encodeValue(1_800_000)).toEqual({ integerValue: '1800000' });
    expect(encodeValue(1_760_000_000_000)).toEqual({ integerValue: '1760000000000' });
  });

  it('texto, null y booleanos', () => {
    expect(encodeValue('Súper')).toEqual({ stringValue: 'Súper' });
    expect(encodeValue(null)).toEqual({ nullValue: null });
    expect(encodeValue(true)).toEqual({ booleanValue: true });
  });

  it('un valor sin soporte falla en vez de guardar basura', () => {
    expect(() => encodeValue({})).toThrow(TypeError);
  });

  it('al leer, el entero (que llega como texto) vuelve a ser número', () => {
    expect(decodeValue({ integerValue: '18000' })).toBe(18_000);
    expect(decodeValue({ stringValue: 'ARS' })).toBe('ARS');
    expect(decodeValue({ nullValue: null })).toBeNull();
    expect(decodeValue({ timestampValue: '2026-10-05T23:52:21.846Z' })).toBe(1_791_244_341_846);
  });

  it('un documento trae su id (el último tramo del nombre) y sus campos', () => {
    expect(
      decodeDocument({
        name: 'projects/p/databases/(default)/documents/users/u/accounts/cash',
        fields: { name: { stringValue: 'Efectivo' }, archivedAt: { nullValue: null } },
      }),
    ).toEqual({ id: 'cash', name: 'Efectivo', archivedAt: null });
    expect(decodeDocument(null)).toBeNull();
  });
});

describe('readUserContext', () => {
  const doc = (collection: string, id: string, fields: object) => ({
    name: `projects/${PROJECT}/databases/(default)/documents/users/ana/${collection}/${id}`,
    fields,
  });

  function firestore(responses: Record<string, Response | (() => Response)>) {
    return vi.fn((url: string) => {
      const path = new URL(url).pathname.split('/documents/')[1] ?? '';
      const response = responses[path];
      if (!response) return Promise.resolve(new Response('?', { status: 500 }));
      return Promise.resolve(typeof response === 'function' ? response() : response);
    }) as unknown as typeof fetch;
  }

  it('lee el perfil, las cuentas y las categorías como la persona (con su token)', async () => {
    const fetch = firestore({
      'users/ana': Response.json({
        name: 'x/users/ana',
        fields: { schemaVersion: { integerValue: '1' } },
      }),
      'users/ana/accounts': Response.json({
        documents: [
          doc('accounts', 'cash', {
            name: { stringValue: 'Efectivo' },
            currency: { stringValue: 'ARS' },
            kind: { stringValue: 'cash' },
            archivedAt: { nullValue: null },
            deletedAt: { nullValue: null },
          }),
        ],
      }),
      'users/ana/categories': Response.json({
        documents: [
          doc('categories', 'seed_comida', {
            name: { stringValue: 'Comida' },
            type: { stringValue: 'expense' },
            archivedAt: { nullValue: null },
            deletedAt: { nullValue: null },
          }),
        ],
      }),
    });
    const user = await readUserContext(config(fetch), 'ana', 'id-token');

    expect(user?.schemaVersion).toBe(1);
    expect(user?.accounts).toMatchObject([
      { id: 'cash', name: 'Efectivo', currency: 'ARS', archivedAt: null, deletedAt: null },
    ]);
    expect(user?.categories).toMatchObject([{ id: 'seed_comida', type: 'expense' }]);
    const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit][];
    for (const [, init] of calls) {
      expect(init.headers).toMatchObject({ Authorization: 'Bearer id-token' });
    }
    // Solo los campos que se usan: menos datos por la red.
    expect(calls.map(([url]) => url).join('\n')).toContain('mask.fieldPaths=currency');
  });

  it('sin perfil (404) devuelve null', async () => {
    const fetch = firestore({ 'users/ana': new Response('{}', { status: 404 }) });
    expect(await readUserContext(config(fetch), 'ana', 't')).toBeNull();
  });

  it('pagina si hay más documentos', async () => {
    let page = 0;
    const fetch = firestore({
      'users/ana': Response.json({
        name: 'x/ana',
        fields: { schemaVersion: { integerValue: '1' } },
      }),
      'users/ana/accounts': () => {
        page += 1;
        return page === 1
          ? Response.json({
              documents: [doc('accounts', 'a', { name: { stringValue: 'A' } })],
              nextPageToken: 'siguiente',
            })
          : Response.json({ documents: [doc('accounts', 'b', { name: { stringValue: 'B' } })] });
      },
      'users/ana/categories': Response.json({}),
    });
    const user = await readUserContext(config(fetch), 'ana', 't');
    expect(user?.accounts.map((a) => a.id)).toEqual(['a', 'b']);
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url as unknown as string);
    expect(urls.some((u) => u.includes('pageToken=siguiente'))).toBe(true);
  });

  it('un error de Firestore se lanza con su estado', async () => {
    const fetch = firestore({
      'users/ana': Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 }),
    });
    await expect(readUserContext(config(fetch), 'ana', 't')).rejects.toMatchObject({
      status: 403,
      firestoreStatus: 'PERMISSION_DENIED',
    });
  });
});

describe('createTransaction', () => {
  const doc = whatsappTransactionDoc(
    {
      type: 'expense',
      amount: 1_800_000,
      date: '2026-10-14',
      description: 'Súper',
      accountId: 'cash',
      categoryId: 'seed_comida',
    },
    1_760_000_000_000,
  );

  it('hace un commit con updatedAt del servidor y la precondición de que no exista', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ writeResults: [{}] })));
    expect(await createTransaction(config(fetch), 'ana', 'tok', 'wa_abc', doc)).toBe('created');

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:commit`,
    );
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
    const { writes } = JSON.parse(init.body as string) as { writes: Record<string, unknown>[] };
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      update: {
        name: `projects/${PROJECT}/databases/(default)/documents/users/ana/transactions/wa_abc`,
        fields: {
          type: { stringValue: 'expense' },
          amount: { integerValue: '1800000' },
          source: { stringValue: 'whatsapp' },
          deletedAt: { nullValue: null },
          createdAt: { integerValue: '1760000000000' },
        },
      },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
    // updatedAt no va en los campos: lo pone el servidor con la transformación.
    expect((writes[0] as { update: { fields: object } }).update.fields).not.toHaveProperty(
      'updatedAt',
    );
  });

  it('si ya existía, cuenta como creado antes (no pisa nada)', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ error: { status: 'ALREADY_EXISTS' } }, { status: 409 })),
    );
    expect(await createTransaction(config(fetch), 'ana', 't', 'wa_abc', doc)).toBe('exists');
  });

  it('si las reglas lo rechazan, lanza el error', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 })),
    );
    await expect(
      createTransaction(config(fetch), 'ana', 't', 'wa_abc', doc),
    ).rejects.toBeInstanceOf(FirestoreError);
  });
});
