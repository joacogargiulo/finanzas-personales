// Estadísticas (SRS 6.5, ADR 0021): ingresos y gastos de una moneda en un período elegible.
// Gráfico 1: barras por mes. Gráficos 2 y 3: donas de gastos e ingresos por categoría.
// Las transferencias y los cambios de moneda no cuentan; las categorías archivadas, sí.
// Todo se calcula en el dispositivo con `computeStats`: no cuesta lecturas de Firestore.

import { useId, useMemo, useState } from 'react';
import { errorMessage } from '../../domain/errors';
import type { Currency } from '../../domain/model';
import {
  computeStats,
  currenciesInUse,
  DEFAULT_PERIOD,
  periodRange,
  validateCustomRange,
  type PeriodPreset,
} from '../../domain/stats';
import { useData, useLedger, useToday } from '../app/hooks';
import { CategoryDonut } from '../components/charts/CategoryDonut';
import { MonthlyBars } from '../components/charts/MonthlyBars';
import { TotalsSummary } from '../components/TotalsSummary';

const PERIODS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'thisMonth', label: 'Este mes' },
  { preset: 'last3', label: '3 meses' },
  { preset: 'last6', label: '6 meses' },
  { preset: 'last12', label: '12 meses' },
  { preset: 'thisYear', label: 'Este año' },
  { preset: 'custom', label: 'Personalizado' },
];

export function StatsScreen() {
  const { accounts, transactions, accountsById, categoriesById } = useLedger();
  const loaded = useData((s) => s.loaded.accounts && s.loaded.transactions);
  const today = useToday();
  const fromId = useId();
  const toId = useId();

  const currencies = useMemo(() => currenciesInUse(accounts), [accounts]);
  const [chosenCurrency, setCurrency] = useState<Currency>('ARS');
  // Si la moneda elegida ya no tiene cuentas, se usa la primera disponible.
  const currency = currencies.includes(chosenCurrency)
    ? chosenCurrency
    : (currencies[0] ?? chosenCurrency);

  const [preset, setPreset] = useState<PeriodPreset>(DEFAULT_PERIOD);
  // El personalizado arranca con el rango que se estaba viendo.
  const [custom, setCustom] = useState(() => periodRange(DEFAULT_PERIOD, today));

  const customResult = useMemo(() => validateCustomRange(custom.from, custom.to), [custom]);
  const range = useMemo(() => {
    if (preset !== 'custom') return periodRange(preset, today);
    return customResult.ok ? customResult.value : null;
  }, [preset, today, customResult]);

  const stats = useMemo(
    () => (range ? computeStats(transactions, accountsById, currency, range) : null),
    [transactions, accountsById, currency, range],
  );

  if (!loaded) return <p className="muted">Cargando tus datos…</p>;

  if (currencies.length === 0) {
    return (
      <section className="card empty">
        <p>Cuando tengas cuentas y movimientos, acá vas a ver tus ingresos y gastos.</p>
      </section>
    );
  }

  return (
    <div className="stats">
      <div className="stats-controls">
        {currencies.length > 1 && (
          <div className="segmented" role="group" aria-label="Moneda">
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === currency}
                onClick={() => {
                  setCurrency(c);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="filter-bar" role="group" aria-label="Período">
          {PERIODS.map(({ preset: value, label }) => (
            <button
              key={value}
              type="button"
              className="chip chip-filter"
              aria-pressed={preset === value}
              onClick={() => {
                if (value === 'custom' && preset !== 'custom' && range) setCustom(range);
                setPreset(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor={fromId}>
                Desde
              </label>
              <input
                id={fromId}
                className="input"
                type="date"
                value={custom.from}
                aria-invalid={!customResult.ok && customResult.error.from !== undefined}
                onChange={(event) => {
                  setCustom((current) => ({ ...current, from: event.target.value }));
                }}
              />
              {!customResult.ok && customResult.error.from && (
                <span className="field-error">{errorMessage(customResult.error.from)}</span>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor={toId}>
                Hasta
              </label>
              <input
                id={toId}
                className="input"
                type="date"
                value={custom.to}
                aria-invalid={!customResult.ok && customResult.error.to !== undefined}
                onChange={(event) => {
                  setCustom((current) => ({ ...current, to: event.target.value }));
                }}
              />
              {!customResult.ok && customResult.error.to && (
                <span className="field-error">{errorMessage(customResult.error.to)}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {stats && stats.isEmpty && (
        <section className="card empty">
          <p>No hay ingresos ni gastos en {currency} en este período.</p>
        </section>
      )}

      {stats && !stats.isEmpty && (
        <div className="stats-grid">
          <section className="card" aria-labelledby="stats-summary-title">
            <h2 id="stats-summary-title" className="card-title">
              Resumen del período
            </h2>
            <TotalsSummary
              currency={currency}
              income={stats.totalIncome}
              expense={stats.totalExpense}
            />
          </section>

          <section className="card stats-wide" aria-labelledby="stats-monthly-title">
            <h2 id="stats-monthly-title" className="card-title">
              Ingresos y gastos por mes
            </h2>
            <MonthlyBars monthly={stats.monthly} currency={currency} />
          </section>

          {stats.expenseByCategory.length > 0 && (
            <section className="card" aria-labelledby="stats-expense-title">
              <h2 id="stats-expense-title" className="card-title">
                Gastos por categoría
              </h2>
              <CategoryDonut
                title="Gastos"
                kind="expense"
                totals={stats.expenseByCategory}
                total={stats.totalExpense}
                currency={currency}
                categories={categoriesById}
              />
            </section>
          )}

          {stats.incomeByCategory.length > 0 && (
            <section className="card" aria-labelledby="stats-income-title">
              <h2 id="stats-income-title" className="card-title">
                Ingresos por categoría
              </h2>
              <CategoryDonut
                title="Ingresos"
                kind="income"
                totals={stats.incomeByCategory}
                total={stats.totalIncome}
                currency={currency}
                categories={categoriesById}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
