// Consultas de Firestore por REST para responder preguntas (ADR 0035): sumas de movimientos para
// los saldos y listados de un rango de fechas para los totales de un período. Como el resto de
// `firestoreRest.ts`, todo se hace con el ID token de la persona: las reglas se aplican igual.

import type { Transaction } from '../../src/domain/model';
import {
  base,
  decodeDocument,
  decodeValue,
  FirestoreError,
  type FirestoreConfig,
} from './firestoreRest';

/** Un filtro de igualdad sobre un campo de texto. Los movimientos eliminados se excluyen siempre. */
export interface EqualFilter {
  field: string;
  equals: string;
}

/** Un filtro "el campo es uno de estos valores" (Firestore admite hasta 30). */
export interface OneOfFilter {
  field: string;
  oneOf: readonly string[];
}

export type SumFilter = EqualFilter | OneOfFilter;

/** Cuántos valores admite Firestore en un filtro `IN`. */
export const MAX_IN_VALUES = 30;

const NOT_DELETED = { unaryFilter: { op: 'IS_NULL', field: { fieldPath: 'deletedAt' } } };

async function failure(response: Response): Promise<FirestoreError> {
  let status: string | null = null;
  try {
    const body = await response.json<unknown>();
    const error = (Array.isArray(body) ? body[0] : body) as { error?: { status?: unknown } };
    if (typeof error.error?.status === 'string') status = error.error.status;
  } catch {
    // Sin cuerpo JSON: queda el estado HTTP.
  }
  return new FirestoreError(response.status, status);
}

/**
 * Suma un campo numérico de los movimientos que cumplen los filtros, con una consulta de
 * agregación: Firestore cobra 1 lectura cada 1.000 entradas del índice, no una por documento.
 * Necesita los índices compuestos de `firestore.indexes.json`.
 */
export async function sumTransactions(
  config: FirestoreConfig,
  uid: string,
  idToken: string,
  filters: readonly SumFilter[],
  field: 'amount' | 'toAmount',
): Promise<number> {
  const response = await config.fetch(`${base(config)}/users/${uid}:runAggregationQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: {
          from: [{ collectionId: 'transactions' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                NOT_DELETED,
                ...filters.map((f) => ({
                  fieldFilter: {
                    field: { fieldPath: f.field },
                    ...('oneOf' in f
                      ? {
                          op: 'IN',
                          value: {
                            arrayValue: { values: f.oneOf.map((v) => ({ stringValue: v })) },
                          },
                        }
                      : { op: 'EQUAL', value: { stringValue: f.equals } }),
                  },
                })),
              ],
            },
          },
        },
        aggregations: [{ alias: 'total', sum: { field: { fieldPath: field } } }],
      },
    }),
  });
  if (!response.ok) throw await failure(response);
  const [first] =
    await response.json<{ result?: { aggregateFields?: { total?: Record<string, unknown> } } }[]>();
  const total = decodeValue(first?.result?.aggregateFields?.total);
  return typeof total === 'number' ? total : 0;
}

/** Los movimientos de un rango de fechas, con los campos que usan las estadísticas. */
export interface TransactionsInRange {
  transactions: Transaction[];
  /** Hubo más movimientos que el tope: no se pueden contar todos. */
  truncated: boolean;
}

/** Tope de documentos que se leen para una consulta de período (cada uno es una lectura). */
export const MAX_RANGE_DOCUMENTS = 5000;

/**
 * Los movimientos con fecha entre `from` y `to`. Solo filtra por `date` (índice automático); los
 * eliminados se descartan acá. Cada documento leído cuenta como una lectura de Firestore.
 */
export async function listTransactionsInRange(
  config: FirestoreConfig,
  uid: string,
  idToken: string,
  range: { from: string; to: string },
): Promise<TransactionsInRange> {
  const date = (op: string, value: string) => ({
    fieldFilter: { field: { fieldPath: 'date' }, op, value: { stringValue: value } },
  });
  const response = await config.fetch(`${base(config)}/users/${uid}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'transactions' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              date('GREATER_THAN_OR_EQUAL', range.from),
              date('LESS_THAN_OR_EQUAL', range.to),
            ],
          },
        },
        select: {
          fields: ['type', 'amount', 'date', 'accountId', 'categoryId', 'deletedAt'].map(
            (fieldPath) => ({ fieldPath }),
          ),
        },
        limit: MAX_RANGE_DOCUMENTS + 1,
      },
    }),
  });
  if (!response.ok) throw await failure(response);
  const rows = await response.json<{ document?: unknown }[]>();
  const docs = rows.flatMap((row) => {
    const doc = decodeDocument(row.document);
    return doc ? [doc] : [];
  });
  const truncated = docs.length > MAX_RANGE_DOCUMENTS;
  const transactions = docs
    .slice(0, MAX_RANGE_DOCUMENTS)
    .filter((d) => d['deletedAt'] === null) as unknown as Transaction[];
  return { transactions, truncated };
}
