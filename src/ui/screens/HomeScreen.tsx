// Inicio (SRS 6.3, diseño "Sereno"): patrimonio estimado, resumen del mes, cuentas y últimos
// movimientos. Pendientes de confirmar y presupuestos se suman en la Fase 5.

import { useMemo, useState } from 'react';
import { alive, selectable, sortAccounts, sortTransactions } from '../../domain/collections';
import { consolidate, equivalentArs, rateFor } from '../../domain/consolidation';
import { errorMessage } from '../../domain/errors';
import { canRestoreAccount } from '../../domain/lifecycle';
import { CURRENCIES, type Account } from '../../domain/model';
import { formatAmount } from '../../domain/money';
import { computeStats, periodRange } from '../../domain/stats';
import { useData, useLedger, useNow, useToday } from '../app/hooks';
import { goTo, openPanel } from '../app/navigation';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { TotalsSummary } from '../components/TotalsSummary';
import { TransactionRow } from '../components/TransactionRow';
import { ACCOUNT_KIND_LABELS, monthLong, rateLabel, ratesAge } from '../format';
import { session } from '../session';

const RECENT_COUNT = 5;

export function HomeScreen() {
  const { accounts, transactions, accountsById, categoriesById, balances } = useLedger();
  const loaded = useData((s) => s.loaded.accounts && s.loaded.transactions);
  const rates = useData((s) => s.rates);
  const now = useNow();
  const today = useToday();

  const consolidation = useMemo(
    () => consolidate(accounts, balances, rates, now),
    [accounts, balances, rates, now],
  );
  const activeAccounts = useMemo(() => sortAccounts(selectable(accounts)), [accounts]);
  // Monedas que tienen alguna cuenta activa: solo esas se muestran.
  const currencies = useMemo(
    () => CURRENCIES.filter((c) => activeAccounts.some((a) => a.currency === c)),
    [activeAccounts],
  );
  const recent = useMemo(
    () => sortTransactions(alive(transactions)).slice(0, RECENT_COUNT),
    [transactions],
  );
  // Resumen del mes: solo las monedas con ingresos o gastos este mes (o la primera, en cero).
  const month = useMemo(() => {
    const range = periodRange('thisMonth', today);
    const all = currencies.map((currency) => ({
      currency,
      stats: computeStats(transactions, accountsById, currency, range),
    }));
    const withActivity = all.filter(({ stats }) => !stats.isEmpty);
    return withActivity.length > 0 ? withActivity : all.slice(0, 1);
  }, [transactions, accountsById, today, currencies]);

  if (!loaded) {
    return <p className="muted">Cargando tus datos…</p>;
  }

  return (
    <>
      {consolidation.archivedWithBalance.map((account) => (
        <ArchivedWithBalance
          key={account.id}
          account={account}
          balance={balances.get(account.id) ?? 0}
          accounts={accounts}
        />
      ))}

      <div className="home-grid">
        <section className="card wealth" aria-labelledby="wealth-title">
          <h2 id="wealth-title" className="muted small wealth-label">
            Patrimonio estimado
          </h2>
          <Money cents={consolidation.totalArs} currency="ARS" className="wealth-total" />
          <RatesLine now={now} />
          {consolidation.missing.map(({ currency, amount }) => (
            <p key={currency} className="small warn-text">
              No incluye {formatAmount(amount, currency)} por falta de cotización.
            </p>
          ))}
          {currencies.length > 0 && (
            <dl className="totals">
              {currencies.map((currency) => (
                <div key={currency} className="totals-row">
                  <dt>{currency}</dt>
                  <dd>
                    <Money cents={consolidation.byCurrency[currency]} currency={currency} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {month.length > 0 && (
          <section className="card" aria-labelledby="month-title">
            <h2 id="month-title" className="card-title">
              Resumen de {monthLong(today)}
            </h2>
            {month.map(({ currency, stats }) => (
              <TotalsSummary
                key={currency}
                currency={currency}
                income={stats.totalIncome}
                expense={stats.totalExpense}
                showCurrency={month.length > 1}
              />
            ))}
          </section>
        )}

        <section className="card" aria-labelledby="accounts-title">
          <div className="card-header">
            <h2 id="accounts-title" className="card-title">
              Cuentas
            </h2>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                openPanel({ kind: 'account', id: null });
              }}
            >
              + Agregar
            </button>
          </div>
          {activeAccounts.length === 0 ? (
            <div className="empty">
              <p>Todavía no tenés cuentas. Creá la primera para empezar a cargar movimientos.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  openPanel({ kind: 'account', id: null });
                }}
              >
                Crear mi primera cuenta
              </button>
            </div>
          ) : (
            <ul className="list">
              {activeAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  balance={balances.get(account.id) ?? account.initialBalance}
                  equivalent={equivalentArs(
                    balances.get(account.id) ?? account.initialBalance,
                    account.currency,
                    rates,
                  )}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="recent-title">
          <div className="card-header">
            <h2 id="recent-title" className="card-title">
              Últimos movimientos
            </h2>
            {recent.length > 0 && (
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  goTo('movimientos');
                }}
              >
                Ver todos
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="empty">Todavía no cargaste movimientos.</p>
          ) : (
            <ul className="list">
              {recent.map((tx) => (
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
          )}
        </section>
      </div>
    </>
  );
}

/** Cotizaciones usadas y su antigüedad (SRS 5.7). */
function RatesLine({ now }: { now: number }) {
  const rates = useData((s) => s.rates);
  if (!rates) {
    return <p className="small muted">Sin cotización del dólar y el euro todavía.</p>;
  }
  const usd = rateFor('USD', rates);
  const eur = rateFor('EUR', rates);
  const age = ratesAge(rates.fetchedAt, now);
  return (
    <p className="small muted">
      {usd !== null && `Dólar blue ${rateLabel(usd)}`}
      {usd !== null && eur !== null && ' · '}
      {eur !== null && `Euro blue ${rateLabel(eur)}`}
      {' · '}
      <span className={age.stale ? 'warn-text' : undefined}>{age.label}</span>
    </p>
  );
}

function AccountRow(props: { account: Account; balance: number; equivalent: number | null }) {
  const { account, balance, equivalent } = props;
  // Tocar la cuenta abre su edición (nombre y tipo).
  return (
    <li>
      <button
        type="button"
        className="list-row row-button"
        onClick={() => {
          openPanel({ kind: 'account', id: account.id });
        }}
      >
        <span className="badge" title={ACCOUNT_KIND_LABELS[account.kind]}>
          <Icon name={account.kind} />
        </span>
        <span className="row-main">
          <span className="row-title">{account.name}</span>
        </span>
        <span className="row-end">
          <Money cents={balance} currency={account.currency} />
          {equivalent !== null && (
            <span className="num small muted">≈ {formatAmount(equivalent, 'ARS')}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Una cuenta archivada quedó con saldo por una carrera entre dispositivos (SRS 5.5, TC-25):
 * se avisa y se ofrece restaurarla. Ese saldo no se suma al total.
 */
function ArchivedWithBalance(props: {
  account: Account;
  balance: number;
  accounts: readonly Account[];
}) {
  const { account, balance, accounts } = props;
  const [error, setError] = useState<string | null>(null);
  const writesBlocked = useData((s) => s.writesBlocked);

  function restore() {
    const check = canRestoreAccount(account, accounts);
    if (!check.ok) {
      setError(`${errorMessage(check.error)} Podés hacerlo desde Ajustes.`);
      return;
    }
    session.writer()?.restoreAccount(account.id);
  }

  return (
    <div className="notice" role="alert">
      <Icon name="warning" />
      <div className="notice-body">
        <p>
          La cuenta archivada <strong>{account.name}</strong> quedó con un saldo de{' '}
          {formatAmount(balance, account.currency)} por un movimiento cargado en otro dispositivo.
          Ese saldo no se suma al total mientras siga archivada.
        </p>
        {error && <p className="field-error">{error}</p>}
        <button type="button" className="btn" disabled={writesBlocked} onClick={restore}>
          Restaurar cuenta
        </button>
      </div>
    </div>
  );
}
