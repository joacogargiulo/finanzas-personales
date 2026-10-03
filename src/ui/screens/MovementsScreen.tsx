// Movimientos (SRS 6.4). Versión inicial: la lista completa, de a 50, ordenada por fecha.
// Los filtros y la agrupación por día llegan en la 3b; el buscador, en la Fase 4.

import { useMemo, useState } from 'react';
import { alive, sortTransactions } from '../../domain/collections';
import { useData, useLedger } from '../app/hooks';
import { openPanel } from '../app/navigation';
import { TransactionRow } from '../components/TransactionRow';

const PAGE_SIZE = 50;

export function MovementsScreen() {
  const { transactions, accountsById, categoriesById } = useLedger();
  const loaded = useData((s) => s.loaded.transactions);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sorted = useMemo(() => sortTransactions(alive(transactions)), [transactions]);

  if (!loaded) return <p className="muted">Cargando tus datos…</p>;

  return (
    <section className="card" aria-label="Lista de movimientos">
      {sorted.length === 0 ? (
        <p className="empty">Todavía no cargaste movimientos.</p>
      ) : (
        <>
          <ul className="list">
            {sorted.slice(0, visible).map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                accounts={accountsById}
                categories={categoriesById}
                showDate
                onSelect={(selected) => {
                  openPanel({ kind: 'transaction', id: selected.id });
                }}
              />
            ))}
          </ul>
          {visible < sorted.length && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setVisible((count) => count + PAGE_SIZE);
              }}
            >
              Cargar más
            </button>
          )}
        </>
      )}
    </section>
  );
}
