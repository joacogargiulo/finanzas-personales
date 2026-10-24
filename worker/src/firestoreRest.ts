// Firestore por su API REST (ADR 0034). El Worker no puede usar el SDK de Firebase (es para
// navegadores), así que habla con la REST: cada valor viaja con su tipo ({ stringValue: "x" },
// { integerValue: "500" }...). Todo se hace con el ID token de la persona, así que las reglas de
// Firestore se aplican igual que en la app.

import type { Account, Category } from '../../src/domain/model';
import type { whatsappTransactionDoc } from '../../src/domain/whatsapp';

/** Un valor con tipo de la REST de Firestore (solo los que usa el modelo). */
export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string };

/** Un valor del modelo (texto, entero, null...) a su forma con tipo. */
export function encodeValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    // Los centavos y las fechas en ms son enteros: nunca viajan como decimales.
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  throw new TypeError('Valor no soportado para Firestore');
}

/** Un valor con tipo de la REST al valor del modelo. `integerValue` llega como texto. */
export function decodeValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if ('nullValue' in v) return null;
  if (typeof v['booleanValue'] === 'boolean') return v['booleanValue'];
  if (typeof v['integerValue'] === 'string') return Number(v['integerValue']);
  if (typeof v['doubleValue'] === 'number') return v['doubleValue'];
  if (typeof v['stringValue'] === 'string') return v['stringValue'];
  // Las marcas de tiempo del servidor (`updatedAt`) se pasan a milisegundos.
  if (typeof v['timestampValue'] === 'string') return Date.parse(v['timestampValue']);
  return undefined;
}

/** Un documento de la REST (`{ name, fields }`) a un objeto plano con su `id`. */
export function decodeDocument(doc: unknown): Record<string, unknown> | null {
  if (typeof doc !== 'object' || doc === null) return null;
  const { name, fields } = doc as { name?: unknown; fields?: unknown };
  if (typeof name !== 'string') return null;
  const result: Record<string, unknown> = { id: name.slice(name.lastIndexOf('/') + 1) };
  if (typeof fields === 'object' && fields !== null) {
    for (const [key, value] of Object.entries(fields)) result[key] = decodeValue(value);
  }
  return result;
}

/** Firestore respondió con un error. */
export class FirestoreError extends Error {
  override name = 'FirestoreError';
  constructor(
    readonly status: number,
    readonly firestoreStatus: string | null,
  ) {
    super(
      `Firestore respondió ${String(status)}${firestoreStatus === null ? '' : ` (${firestoreStatus})`}`,
    );
  }
}

async function failure(response: Response): Promise<FirestoreError> {
  let status: string | null = null;
  try {
    const body = await response.json<{ error?: { status?: unknown } }>();
    if (typeof body.error?.status === 'string') status = body.error.status;
  } catch {
    // Sin cuerpo JSON: queda el estado HTTP.
  }
  return new FirestoreError(response.status, status);
}

export interface FirestoreConfig {
  projectId: string;
  fetch: typeof fetch;
}

/** Lo que el bot necesita saber de la persona para interpretar y validar un movimiento. */
export interface UserContext {
  schemaVersion: number;
  accounts: Account[];
  categories: Category[];
}

const PAGE_SIZE = 300;

export function base(config: FirestoreConfig): string {
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
}

/** Todos los documentos de una subcolección, con los campos pedidos y paginando. */
async function listAll(
  config: FirestoreConfig,
  idToken: string,
  path: string,
  fields: readonly string[],
): Promise<Record<string, unknown>[]> {
  const docs: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    for (const field of fields) params.append('mask.fieldPaths', field);
    if (pageToken) params.set('pageToken', pageToken);
    const response = await config.fetch(`${base(config)}/${path}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) throw await failure(response);
    const page = await response.json<{ documents?: unknown[]; nextPageToken?: string }>();
    for (const raw of page.documents ?? []) {
      const doc = decodeDocument(raw);
      if (doc) docs.push(doc);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return docs;
}

/**
 * El perfil, las cuentas y las categorías de la persona. `null` si no tiene perfil (nunca abrió
 * la app: sin el perfil ni las categorías iniciales, no hay dónde cargar nada).
 */
export async function readUserContext(
  config: FirestoreConfig,
  uid: string,
  idToken: string,
): Promise<UserContext | null> {
  const profile = await config.fetch(`${base(config)}/users/${uid}?mask.fieldPaths=schemaVersion`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (profile.status === 404) return null;
  if (!profile.ok) throw await failure(profile);
  const schemaVersion = decodeDocument(await profile.json())?.['schemaVersion'];
  if (typeof schemaVersion !== 'number') return null;

  const [accounts, categories] = await Promise.all([
    listAll(config, idToken, `users/${uid}/accounts`, [
      'name',
      'currency',
      'kind',
      'initialBalance',
      'archivedAt',
      'deletedAt',
    ]),
    listAll(config, idToken, `users/${uid}/categories`, [
      'name',
      'type',
      'archivedAt',
      'deletedAt',
    ]),
  ]);
  return {
    schemaVersion,
    // Lo que no está en la máscara no se usa acá; se completa para cumplir el tipo.
    accounts: accounts.map((a) => ({
      initialBalance: 0,
      createdAt: 0,
      updatedAt: 0,
      ...a,
    })) as unknown as Account[],
    categories: categories.map((c) => ({
      icon: '',
      color: '',
      createdAt: 0,
      updatedAt: 0,
      ...c,
    })) as unknown as Category[],
  };
}

/**
 * Crea el movimiento con un `commit`. `updatedAt` lo pone el servidor (`REQUEST_TIME`), igual que
 * `serverTimestamp()` en la app, y la precondición `exists: false` hace que repetir la escritura
 * no pise nada. Devuelve `'exists'` si ya estaba (el mismo criterio que `confirmOccurrence`).
 */
export async function createTransaction(
  config: FirestoreConfig,
  uid: string,
  idToken: string,
  id: string,
  doc: ReturnType<typeof whatsappTransactionDoc>,
): Promise<'created' | 'exists'> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(doc)) {
    fields[key] = encodeValue(value);
  }
  const root = `projects/${config.projectId}/databases/(default)/documents`;
  const response = await config.fetch(`${base(config)}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: { name: `${root}/users/${uid}/transactions/${id}`, fields },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: false },
        },
      ],
    }),
  });
  if (response.ok) return 'created';
  const error = await failure(response);
  if (
    error.firestoreStatus === 'ALREADY_EXISTS' ||
    error.firestoreStatus === 'FAILED_PRECONDITION'
  ) {
    return 'exists';
  }
  throw error;
}
