// Un monto en DM Mono con cifras tabulares. El signo va siempre en el texto, no solo en el color
// (SRS 10, accesibilidad).

import type { Cents, Currency } from '../../domain/model';
import { formatAmount } from '../../domain/money';

interface MoneyProps {
  cents: Cents;
  currency: Currency;
  sign?: 'always' | 'auto' | 'never';
  tone?: 'income' | 'expense' | null;
  className?: string | undefined;
}

export function Money({ cents, currency, sign = 'auto', tone = null, className }: MoneyProps) {
  const classes = ['num', tone ? `amount--${tone}` : '', className ?? ''].filter(Boolean);
  return <span className={classes.join(' ')}>{formatAmount(cents, currency, { sign })}</span>;
}
