// Ingresos, gastos y balance de un período en una moneda. Lo usan el resumen del mes de Inicio
// y el resumen del período de Estadísticas.

import type { Cents, Currency } from '../../domain/model';
import { Money } from './Money';

interface TotalsSummaryProps {
  currency: Currency;
  income: Cents;
  expense: Cents;
  /** Con varias monedas, cada resumen lleva su moneda arriba. */
  showCurrency?: boolean;
}

export function TotalsSummary({
  currency,
  income,
  expense,
  showCurrency = false,
}: TotalsSummaryProps) {
  return (
    <dl className="totals month-summary">
      {showCurrency && <dt className="month-currency">{currency}</dt>}
      <div className="totals-row">
        <dt>Ingresos</dt>
        <dd>
          <Money cents={income} currency={currency} sign="always" tone="income" />
        </dd>
      </div>
      <div className="totals-row">
        <dt>Gastos</dt>
        <dd>
          <Money cents={-expense} currency={currency} tone="expense" />
        </dd>
      </div>
      <div className="totals-row">
        <dt>Balance</dt>
        <dd>
          <Money cents={income - expense} currency={currency} sign="always" />
        </dd>
      </div>
    </dl>
  );
}
