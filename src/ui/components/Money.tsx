// Un monto en DM Mono con cifras tabulares. El signo va siempre en el texto, no solo en el color
// (SRS 10, accesibilidad). Con `masked` (el ojo de Inicio), solo se ve el símbolo de la moneda.

import type { Cents, Currency } from '../../domain/model';
import { currencySymbol, formatAmount } from '../../domain/money';

/** Lo que se ve en lugar de un monto oculto. */
export const MASK = '•••••';

interface MoneyProps {
  cents: Cents;
  currency: Currency;
  sign?: 'always' | 'auto' | 'never';
  tone?: 'income' | 'expense' | null;
  className?: string | undefined;
  masked?: boolean;
}

export function Money(props: MoneyProps) {
  const { cents, currency, sign = 'auto', tone = null, className, masked = false } = props;
  const classes = ['num', tone ? `amount--${tone}` : '', className ?? ''].filter(Boolean);
  if (masked) {
    return (
      <span className={classes.join(' ')} aria-label="Monto oculto">
        {currencySymbol(currency)} {MASK}
      </span>
    );
  }
  return <span className={classes.join(' ')}>{formatAmount(cents, currency, { sign })}</span>;
}
