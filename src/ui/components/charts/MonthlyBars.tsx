// Gráfico 1 de Estadísticas (SRS 6.5): ingresos y gastos por mes, en barras agrupadas.
// El SVG es decorativo para los lectores de pantalla: la misma información está en una tabla
// oculta y en el detalle del mes elegido. Los meses son botones: tocar uno muestra sus montos.

import { useState } from 'react';
import type { Currency } from '../../../domain/model';
import type { MonthTotals } from '../../../domain/stats';
import { axisLabel, barLayout, labelStep, niceScale } from '../../charts';
import { monthLong, monthShort } from '../../format';
import { Money } from '../Money';
import { useWidth } from './useWidth';

/** Alto del área de las barras y espacio a la izquierda para las etiquetas del eje. */
const PLOT_HEIGHT = 160;
const AXIS_WIDTH = 64;
const TOP_PADDING = 8;

interface MonthlyBarsProps {
  monthly: readonly MonthTotals[];
  currency: Currency;
}

/** `2026-10` → fecha del día 1, para reutilizar los nombres de los meses. */
const firstDay = (month: string) => `${month}-01`;

export function MonthlyBars({ monthly, currency }: MonthlyBarsProps) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<string | null>(null);

  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const max = Math.max(0, ...monthly.map((m) => Math.max(m.income, m.expense)));
  const scale = niceScale(max);
  const groups = barLayout(monthly, { width: plotWidth, height: PLOT_HEIGHT, scaleMax: scale.max });
  const step = labelStep(monthly.length, plotWidth);
  // Sin elegir, se muestra el último mes del período (normalmente, el actual).
  const current = monthly.find((m) => m.month === selected) ?? monthly.at(-1);

  return (
    <div className="bars" ref={ref}>
      <svg
        className="bars-svg"
        width={width}
        height={PLOT_HEIGHT + TOP_PADDING}
        aria-hidden="true"
        focusable="false"
      >
        <g transform={`translate(0 ${String(TOP_PADDING)})`}>
          {scale.ticks.map((tick) => {
            const y = PLOT_HEIGHT - (tick / scale.max) * PLOT_HEIGHT;
            return (
              <g key={tick}>
                <line className="bars-grid" x1={AXIS_WIDTH} x2={width} y1={y} y2={y} />
                <text className="bars-axis" x={AXIS_WIDTH - 8} y={y} dy="0.32em" textAnchor="end">
                  {axisLabel(tick, currency)}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${String(AXIS_WIDTH)} 0)`}>
            {groups.map((group, i) => {
              const month = monthly[i]?.month ?? '';
              const dimmed = current !== undefined && current.month !== month;
              return (
                <g key={month} className={dimmed ? 'bars-group is-dimmed' : 'bars-group'}>
                  <rect className="bar bar--income" rx={3} {...group.income} />
                  <rect className="bar bar--expense" rx={3} {...group.expense} />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <div
        className="bars-months"
        style={{
          marginLeft: AXIS_WIDTH,
          gridTemplateColumns: `repeat(${String(monthly.length)}, minmax(0, 1fr))`,
        }}
      >
        {monthly.map(({ month }, i) => (
          <button
            key={month}
            type="button"
            className="bars-month"
            aria-pressed={current?.month === month}
            aria-label={`${monthLong(firstDay(month))} ${month.slice(0, 4)}`}
            onClick={() => {
              setSelected(month);
            }}
          >
            {/* Si no entran todas las etiquetas, se escribe una cada `step` meses. */}
            <span aria-hidden="true">
              {(monthly.length - 1 - i) % step === 0 ? monthShort(firstDay(month)) : ''}
            </span>
          </button>
        ))}
      </div>

      {current && (
        <p className="bars-detail" aria-live="polite">
          <span className="bars-detail-month">
            {monthLong(firstDay(current.month))} {current.month.slice(0, 4)}
          </span>
          <span className="legend legend--income">
            Ingresos <Money cents={current.income} currency={currency} sign="always" />
          </span>
          <span className="legend legend--expense">
            Gastos <Money cents={-current.expense} currency={currency} />
          </span>
        </p>
      )}

      <table className="visually-hidden">
        <caption>Ingresos y gastos por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Ingresos</th>
            <th scope="col">Gastos</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <th scope="row">
                {monthLong(firstDay(m.month))} {m.month.slice(0, 4)}
              </th>
              <td>
                <Money cents={m.income} currency={currency} />
              </td>
              <td>
                <Money cents={m.expense} currency={currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
