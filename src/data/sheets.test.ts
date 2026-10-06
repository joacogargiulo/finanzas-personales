import { describe, expect, it } from 'vitest';
import type { Table } from '../domain/exportTables';
import { GoogleError } from './googleToken';
import { exportToSheets, SPREADSHEET_TITLE } from './sheets';

// La API de Google se reemplaza por un `fetch` falso: cada test decide qué responde y después
// revisa qué pedidos hizo la app, en qué orden y con qué contenido.

const tables: Table[] = [
  { name: 'cuentas', title: 'Cuentas', headers: ['Nombre'], rows: [] },
  {
    name: 'movimientos',
    title: 'Movimientos',
    headers: ['Monto'],
    rows: [[{ kind: 'money', cents: 100 }]],
  },
];

interface Call {
  method: string;
  url: string;
  body: unknown;
}

type Responder = (call: Call) => { status: number; body?: unknown };

function fakeFetch(respond: Responder) {
  const calls: Call[] = [];
  const fetchFn = (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const raw = init.body;
    const call: Call = {
      method: init.method ?? 'GET',
      url: input.toString(),
      body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined,
    };
    calls.push(call);
    const { status, body } = respond(call);
    return Promise.resolve(new Response(JSON.stringify(body ?? {}), { status }));
  };
  // La app siempre llama con una URL de texto; el tipo de `fetch` acepta más cosas.
  return { fetchFn: fetchFn as typeof fetch, calls };
}

const spreadsheet = (id: string, titles: string[]) => ({
  spreadsheetId: id,
  spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}`,
  sheets: titles.map((title, index) => ({
    properties: { sheetId: index + 10, title, gridProperties: { rowCount: 1000 } },
  })),
});

/** Un Google que funciona: la hoja `saved` existe y no está en la papelera. */
function healthyGoogle(overrides: Partial<Record<string, Responder>> = {}): Responder {
  return (call) => {
    const pick = (key: string, fallback: Responder) => (overrides[key] ?? fallback)(call);
    if (call.url.includes('/drive/v3/files/'))
      return pick('drive', () => ({ status: 200, body: { trashed: false } }));
    if (call.url.endsWith(':batchUpdate'))
      return pick('batch', () => ({ status: 200, body: { replies: [] } }));
    if (call.method === 'POST')
      return pick('create', () => ({
        status: 200,
        body: spreadsheet('nueva', ['Cuentas', 'Movimientos']),
      }));
    return pick('get', () => ({
      status: 200,
      body: spreadsheet('saved', ['Cuentas', 'Movimientos']),
    }));
  };
}

const batches = (calls: Call[]) => calls.filter((call) => call.url.endsWith(':batchUpdate'));

describe('qué hoja usa', () => {
  // La primera vez no hay ID guardado: se crea la hoja con las pestañas y la configuración argentina.
  it('sin ID guardado crea la hoja', async () => {
    const { fetchFn, calls } = fakeFetch(healthyGoogle());
    const result = await exportToSheets('token', tables, null, fetchFn);

    expect(result).toEqual({
      spreadsheetId: 'nueva',
      url: 'https://docs.google.com/spreadsheets/d/nueva',
    });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: {
        properties: { title: SPREADSHEET_TITLE, locale: 'es_AR' },
        sheets: [{ properties: { title: 'Cuentas' } }, { properties: { title: 'Movimientos' } }],
      },
    });
  });

  it('con un ID guardado y vigente, actualiza esa hoja', async () => {
    const { fetchFn, calls } = fakeFetch(healthyGoogle());
    const result = await exportToSheets('token', tables, 'saved', fetchFn);

    expect(result.spreadsheetId).toBe('saved');
    expect(calls.some((call) => call.method === 'POST' && !call.url.endsWith(':batchUpdate'))).toBe(
      false,
    );
  });

  // Si el usuario borró la hoja o la mandó a la papelera, se crea otra (SRS 8.4).
  it.each([
    ['borrada', { drive: () => ({ status: 404 }) }],
    ['en la papelera', { drive: () => ({ status: 200, body: { trashed: true } }) }],
    ['sin acceso', { get: () => ({ status: 403 }) }],
  ])('si la hoja guardada está %s, crea otra', async (_, overrides) => {
    const { fetchFn } = fakeFetch(healthyGoogle(overrides));
    const result = await exportToSheets('token', tables, 'saved', fetchFn);
    expect(result.spreadsheetId).toBe('nueva');
  });

  it('si falta una pestaña, la vuelve a crear', async () => {
    const { fetchFn, calls } = fakeFetch(
      healthyGoogle({
        get: () => ({ status: 200, body: spreadsheet('saved', ['Cuentas']) }),
        batch: (call) =>
          (call.body as { requests: { addSheet?: unknown }[] }).requests[0]?.addSheet
            ? {
                status: 200,
                body: {
                  replies: [{ addSheet: { properties: { sheetId: 99, title: 'Movimientos' } } }],
                },
              }
            : { status: 200, body: { replies: [] } },
      }),
    );
    await exportToSheets('token', tables, 'saved', fetchFn);

    const [add, data] = batches(calls);
    expect(add?.body).toEqual({
      requests: [{ addSheet: { properties: { title: 'Movimientos' } } }],
    });
    expect(JSON.stringify(data?.body)).toContain('"sheetId":99');
  });
});

describe('cómo escribe', () => {
  // Un solo batchUpdate con las dos pestañas: Google lo aplica entero o no aplica nada.
  it('manda todos los datos en un solo batchUpdate con el token', async () => {
    const { fetchFn, calls } = fakeFetch(healthyGoogle());
    await exportToSheets('token', tables, 'saved', fetchFn);

    const [data, ...rest] = batches(calls);
    expect(rest).toHaveLength(0);
    const sheetIds = new Set(
      (data?.body as { requests: { updateCells?: { start: { sheetId: number } } }[] }).requests
        .map((request) => request.updateCells?.start.sheetId)
        .filter((id) => id !== undefined),
    );
    expect(sheetIds).toEqual(new Set([10, 11]));
  });
});

describe('errores', () => {
  it('401 → el permiso venció (auth)', async () => {
    const { fetchFn } = fakeFetch(() => ({ status: 401 }));
    await expect(exportToSheets('token', tables, null, fetchFn)).rejects.toEqual(
      new GoogleError('auth'),
    );
  });

  it('otro error de Google → google', async () => {
    const { fetchFn } = fakeFetch(healthyGoogle({ batch: () => ({ status: 500 }) }));
    await expect(exportToSheets('token', tables, 'saved', fetchFn)).rejects.toMatchObject({
      code: 'google',
    });
  });

  it('sin red → network', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    await expect(exportToSheets('token', tables, null, fetchFn)).rejects.toMatchObject({
      code: 'network',
    });
  });
});
