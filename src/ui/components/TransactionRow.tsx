// Un movimiento en una lista (SRS 6.4, diseño "Sereno"). Si recibe `onSelect`, toda la fila es
// un botón que abre el movimiento.

import { Fragment } from 'react';
import { formatDisplayDate } from '../../domain/dates';
import type { Account, Category, Transaction } from '../../domain/model';
import { transactionView, type NamedRef } from '../transactionView';
import { Icon } from './Icon';
import { Money } from './Money';
import { SwipeRow } from './SwipeRow';

interface TransactionRowProps {
  transaction: Transaction;
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
  /** Muestra la fecha en el subtítulo (en las listas que no agrupan por día). */
  showDate?: boolean;
  onSelect?: (transaction: Transaction) => void;
  /** Arrastrar la fila muestra Editar y Eliminar (Movimientos, en el celular). */
  swipe?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDelete: (transaction: Transaction) => void;
    /** El movimiento no se puede modificar: no se arrastra. */
    locked: boolean;
  };
}

function Ref({ value }: { value: NamedRef }) {
  return (
    <>
      {value.name}
      {value.tag && <em className="tag">{value.tag}</em>}
    </>
  );
}

export function TransactionRow({
  transaction,
  accounts,
  categories,
  showDate = false,
  onSelect,
  swipe,
}: TransactionRowProps) {
  const view = transactionView(transaction, accounts, categories);

  const parts: React.ReactNode[] = [];
  if (showDate) parts.push(formatDisplayDate(transaction.date).slice(0, 5));
  if (view.category) parts.push(<Ref value={view.category} />);
  parts.push(
    view.to ? (
      <>
        <Ref value={view.from} /> → <Ref value={view.to} />
      </>
    ) : (
      <Ref value={view.from} />
    ),
  );
  if (view.rate) parts.push(view.rate);

  const content = (
    <>
      <span className={`badge tone-${transaction.type}`}>
        <Icon name={transaction.type} />
      </span>
      <span className="row-main">
        <span className="row-title">{view.title}</span>
        <span className="row-subtitle">
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && ' · '}
              {part}
            </Fragment>
          ))}
        </span>
      </span>
      <span className="row-end">
        {view.amounts.map((amount, index) => (
          <Money
            key={index}
            cents={amount.cents}
            currency={amount.currency}
            sign={amount.sign}
            tone={amount.tone}
            className={view.amounts.length > 1 ? 'small' : undefined}
          />
        ))}
      </span>
    </>
  );

  if (swipe && onSelect) {
    return (
      <SwipeRow
        open={swipe.open}
        onOpenChange={swipe.onOpenChange}
        disabled={swipe.locked}
        onSelect={() => {
          onSelect(transaction);
        }}
        actions={[
          {
            label: 'Editar',
            icon: 'edit',
            tone: 'edit',
            onClick: () => {
              onSelect(transaction);
            },
          },
          {
            label: 'Eliminar',
            icon: 'trash',
            tone: 'danger',
            onClick: () => {
              swipe.onDelete(transaction);
            },
          },
        ]}
      >
        {content}
      </SwipeRow>
    );
  }

  return (
    <li>
      {onSelect ? (
        <button
          type="button"
          className="list-row row-button"
          onClick={() => {
            onSelect(transaction);
          }}
        >
          {content}
        </button>
      ) : (
        <div className="list-row">{content}</div>
      )}
    </li>
  );
}
