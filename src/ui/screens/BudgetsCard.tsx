// "Presupuestos del mes" en Inicio (SRS 6.3.4, 5.9): una barra por presupuesto. Verde hasta el
// 80 %, amarilla hasta el 100 % y roja si se pasó. El porcentaje y lo excedido van también en el
// texto: el color no puede ser la única señal (SRS 10). Sin alertas ni notificaciones.

import type { BudgetLevel, BudgetStatus } from '../../domain/budgets';
import { categoryIcon } from '../../domain/categoryStyle';
import { formatAmount } from '../../domain/money';
import { Icon } from '../components/Icon';
import { categoryTone } from '../categoryTone';
import { monthLong } from '../format';

const LEVEL_LABELS: Record<BudgetLevel, string> = {
  ok: 'dentro del límite',
  warning: 'cerca del límite',
  over: 'pasado del límite',
};

interface BudgetsCardProps {
  statuses: readonly BudgetStatus[];
  today: string;
  /** Muestra la moneda junto a la categoría (si hay presupuestos en más de una). */
  showCurrency: boolean;
}

export function BudgetsCard({ statuses, today, showCurrency }: BudgetsCardProps) {
  if (statuses.length === 0) return null;
  return (
    <section className="card" aria-labelledby="budgets-title">
      <h2 id="budgets-title" className="card-title">
        Presupuestos de {monthLong(today)}
      </h2>
      <ul className="list budgets">
        {statuses.map((status) => {
          const { budget, category } = status;
          return (
            <li key={budget.id} className={`budget budget--${status.level}`}>
              <div className="budget-head">
                <span className="badge badge--small" style={categoryTone(category.color)}>
                  <Icon name={categoryIcon(category.icon)} size={16} />
                </span>
                <span className="row-title">
                  {category.name}
                  {showCurrency && <span className="muted"> · {budget.currency}</span>}
                </span>
                <span className="num budget-percent">{status.percent} %</span>
              </div>
              <div
                className="budget-bar"
                role="progressbar"
                aria-label={`${category.name}: ${LEVEL_LABELS[status.level]}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(status.percent, 100)}
                aria-valuetext={`${String(status.percent)} %`}
              >
                <span style={{ width: `${String(Math.min(status.percent, 100))}%` }} />
              </div>
              <p className="small muted num">
                {formatAmount(status.spent, budget.currency)} de{' '}
                {formatAmount(status.limit, budget.currency)}
                {status.level === 'over' && (
                  <span className="budget-excess">
                    {' '}
                    · Te pasaste por {formatAmount(status.excess, budget.currency)}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
