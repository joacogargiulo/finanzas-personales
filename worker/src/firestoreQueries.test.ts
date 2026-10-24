import { describe, expect, it, vi } from 'vitest';
import { listTransactionsInRange, MAX_RANGE_DOCUMENTS, sumTransactions } from './firestoreQueries';

// Las consultas de agregación y de rango por REST (ADR 0035), con un `fetch` falso.

const PROJECT = 'proyecto-test';
const config = (fetch: typeof globalThis.fetch) => ({ projectId: PROJECT, fetch });

describe('sumTransactions', () => {
  it('pide la suma con los filtros de igualdad y sin los movimientos eliminados', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json([{ result: { aggregateFields: { total: { integerValue: '1234500' } } } }]),
      ),
    );
    const total = await sumTransactions(
      config(fetch),
      'ana',
      'tok',
      [
        { field: 'type', equals: 'expense' },
        { field: 'accountId', equals: 'cash' },
      ],
      'amount',
    );

    expect(total).toBe(1_234_500);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/ana:runAggregationQuery`,
    );
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
    const body = JSON.parse(init.body as string) as {
      structuredAggregationQuery: {
        structuredQuery: { where: { compositeFilter: { filters: object[] } } };
        aggregations: object[];
      };
    };
    const query = body.structuredAggregationQuery;
    expect(query.aggregations).toEqual([
      { alias: 'total', sum: { field: { fieldPath: 'amount' } } },
    ]);
    expect(query.structuredQuery.where.compositeFilter.filters).toEqual([
      { unaryFilter: { op: 'IS_NULL', field: { fieldPath: 'deletedAt' } } },
      {
        fieldFilter: {
          field: { fieldPath: 'type' },
          op: 'EQUAL',
          value: { stringValue: 'expense' },
        },
      },
      {
        fieldFilter: {
          field: { fieldPath: 'accountId' },
          op: 'EQUAL',
          value: { stringValue: 'cash' },
        },
      },
    ]);
  });

  // Firestore no devuelve el campo si no hay documentos que sumar.
  it('sin movimientos, la suma es 0', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json([{ result: { aggregateFields: {} } }])),
    );
    expect(await sumTransactions(config(fetch), 'ana', 't', [], 'amount')).toBe(0);
  });

  it('un error de Firestore (por ejemplo, falta un índice) se lanza con su estado', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json([{ error: { status: 'FAILED_PRECONDITION' } }], { status: 400 }),
      ),
    );
    await expect(sumTransactions(config(fetch), 'ana', 't', [], 'amount')).rejects.toMatchObject({
      status: 400,
      firestoreStatus: 'FAILED_PRECONDITION',
    });
  });
});

describe('listTransactionsInRange', () => {
  const row = (id: string, fields: Record<string, object>) => ({
    document: {
      name: `projects/${PROJECT}/databases/(default)/documents/users/ana/transactions/${id}`,
      fields,
    },
  });
  const expense = (id: string, deletedAt: object = { nullValue: null }) =>
    row(id, {
      type: { stringValue: 'expense' },
      amount: { integerValue: '50000' },
      date: { stringValue: '2026-10-05' },
      accountId: { stringValue: 'cash' },
      categoryId: { stringValue: 'seed_comida' },
      deletedAt,
    });

  it('filtra por fecha, pide solo los campos necesarios y descarta los eliminados', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json([expense('a'), expense('b', { integerValue: '1760000000000' }), {}]),
      ),
    );
    const result = await listTransactionsInRange(config(fetch), 'ana', 't', {
      from: '2026-10-01',
      to: '2026-10-14',
    });

    expect(result.truncated).toBe(false);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      id: 'a',
      type: 'expense',
      amount: 50_000,
      accountId: 'cash',
      deletedAt: null,
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      structuredQuery: {
        where: { compositeFilter: { filters: { fieldFilter: { op: string } }[] } };
        select: { fields: { fieldPath: string }[] };
        limit: number;
      };
    };
    expect(body.structuredQuery.where.compositeFilter.filters.map((f) => f.fieldFilter.op)).toEqual(
      ['GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL'],
    );
    expect(body.structuredQuery.select.fields.map((f) => f.fieldPath)).not.toContain('description');
    expect(body.structuredQuery.limit).toBe(MAX_RANGE_DOCUMENTS + 1);
  });

  it('si hay más que el tope, avisa y no devuelve los de más', async () => {
    const rows = Array.from({ length: MAX_RANGE_DOCUMENTS + 1 }, (_, i) =>
      expense(`t${String(i)}`),
    );
    const fetch = vi.fn(() => Promise.resolve(Response.json(rows)));
    const result = await listTransactionsInRange(config(fetch), 'ana', 't', {
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(result.truncated).toBe(true);
    expect(result.transactions).toHaveLength(MAX_RANGE_DOCUMENTS);
  });

  it('un error de Firestore se lanza', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 })),
    );
    await expect(
      listTransactionsInRange(config(fetch), 'ana', 't', { from: 'a', to: 'b' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
