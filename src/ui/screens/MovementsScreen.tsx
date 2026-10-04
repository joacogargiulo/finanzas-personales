// Movimientos (SRS 6.4, diseño "Sereno"): filtros combinables, lista agrupada por día con su
// subtotal y carga de a 50. Tocar un movimiento lo abre; en el celular, arrastrarlo hacia la
// izquierda muestra Editar y Eliminar. El buscador de texto llega en la Fase 4.

import { useMemo, useState } from 'react';
import { alive, sortTransactions } from '../../domain/collections';
import { groupByDay } from '../../domain/grouping';
import type { Transaction, TransactionType } from '../../domain/model';
import { EMPTY_FILTERS, filterTransactions, type TransactionFilters } from '../../domain/search';
import { canModifyTransaction } from '../../domain/validation';
import { useData, useLedger, useToday } from '../app/hooks';
import { openPanel } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { TransactionRow } from '../components/TransactionRow';
import { dayHeading } from '../format';
import { FiltersSheet } from '../panels/FiltersSheet';
import { session } from '../session';
import { transactionView } from '../transactionView';

const PAGE_SIZE = 50;

const TYPE_FILTERS: { type: TransactionType | null; label: string }[] = [
  { type: null, label: 'Todos' },
  { type: 'expense', label: 'Gastos' },
  { type: 'income', label: 'Ingresos' },
  { type: 'transfer', label: 'Transferencias' },
  { type: 'exchange', label: 'Cambios' },
];

/** Cuántos filtros del panel (no el tipo) están activos, para mostrarlo en el botón. */
function panelFilterCount(filters: TransactionFilters): number {
  return [filters.accountId, filters.categoryId, filters.from, filters.to].filter(
    (value) => value !== null,
  ).length;
}

export function MovementsScreen() {
  const { accounts, categories, transactions, accountsById, categoriesById } = useLedger();
  const loaded = useData((s) => s.loaded.transactions);
  const writesBlocked = useData((s) => s.writesBlocked);
  const today = useToday();

  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const sorted = useMemo(() => sortTransactions(alive(transactions)), [transactions]);
  const filtered = useMemo(
    () => filterTransactions(sorted, filters, accountsById, categoriesById),
    [sorted, filters, accountsById, categoriesById],
  );
  const groups = useMemo(
    () => groupByDay(filtered.slice(0, visible), accountsById),
    [filtered, visible, accountsById],
  );

  function applyFilters(next: TransactionFilters) {
    setFilters(next);
    setVisible(PAGE_SIZE);
    setOpenRow(null);
  }

  if (!loaded) return <p className="muted">Cargando tus datos…</p>;

  const panelCount = panelFilterCount(filters);
  const filtering = panelCount > 0 || filters.type !== null;

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filtrar por tipo">
        {TYPE_FILTERS.map(({ type, label }) => (
          <button
            key={label}
            type="button"
            className="chip chip-filter"
            aria-pressed={filters.type === type}
            onClick={() => {
              applyFilters({ ...filters, type });
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-filter"
          aria-pressed={panelCount > 0}
          onClick={() => {
            setShowFilters(true);
          }}
        >
          <Icon name="filter" size={16} />
          Filtros{panelCount > 0 ? ` (${String(panelCount)})` : ''}
        </button>
      </div>

      {filtered.length === 0 ? (
        <section className="card empty">
          {filtering ? (
            <>
              <p>No hay movimientos con estos filtros.</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  applyFilters(EMPTY_FILTERS);
                }}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <p>Todavía no cargaste movimientos.</p>
          )}
        </section>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.date} className="day" aria-label={dayHeading(group.date, today)}>
              <h2 className="day-heading">
                <span>{dayHeading(group.date, today)}</span>
                <span className="day-totals">
                  {group.subtotals.map(({ currency, amount }) => (
                    <Money key={currency} cents={amount} currency={currency} sign="always" />
                  ))}
                </span>
              </h2>
              <ul className="list card day-list">
                {group.transactions.map((tx) => {
                  const locked = writesBlocked || !canModifyTransaction(tx, accountsById).ok;
                  return (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      accounts={accountsById}
                      categories={categoriesById}
                      onSelect={(selected) => {
                        openPanel({ kind: 'transaction', id: selected.id });
                      }}
                      swipe={{
                        open: openRow === tx.id,
                        locked,
                        onOpenChange: (open) => {
                          setOpenRow(open ? tx.id : null);
                        },
                        onDelete: setDeleting,
                      }}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
          {visible < filtered.length && (
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

      {showFilters && (
        <FiltersSheet
          filters={filters}
          accounts={accounts}
          categories={categories}
          onClose={() => {
            setShowFilters(false);
          }}
          onApply={(next) => {
            applyFilters(next);
            setShowFilters(false);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="¿Eliminar este movimiento?"
          confirmLabel="Eliminar"
          danger
          onClose={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            session.writer()?.deleteTransaction(deleting.id);
            setDeleting(null);
          }}
        >
          <DeleteSummary transaction={deleting} />
        </ConfirmDialog>
      )}
    </>
  );
}

/** "Supermercado · − $ 18.400,00 · 03/10": para confirmar qué se elimina. */
function DeleteSummary({ transaction }: { transaction: Transaction }) {
  const { accountsById, categoriesById } = useLedger();
  const view = transactionView(transaction, accountsById, categoriesById);
  const amount = view.amounts[0];
  return (
    <p>
      <strong>{view.title}</strong>
      {amount && (
        <>
          {' · '}
          <Money cents={amount.cents} currency={amount.currency} sign={amount.sign} />
        </>
      )}
      . Los saldos se recalculan enseguida.
    </p>
  );
}
