// Abre el panel que indica la dirección (ADR 0018) y lo conecta con los datos y las escrituras.
// Guardar nunca espera a Firestore (CLAUDE.md, regla 3): el panel se cierra enseguida y el
// cambio aparece en la pantalla por el listener a la caché (ADR 0016).

import { useEffect } from 'react';
import { errorMessage } from '../../domain/errors';
import { canChangeCategoryType } from '../../domain/lifecycle';
import { canModifyTransaction } from '../../domain/validation';
import { changedFields, type AccountChanges, type CategoryChanges } from '../../data/writes';
import { useData, useLedger, useToday } from '../app/hooks';
import { closePanel, openPanel } from '../app/navigation';
import type { Panel } from '../app/route';
import { session } from '../session';
import { AccountSheet } from './AccountSheet';
import { CategorySheet } from './CategorySheet';
import { TransactionSheet } from './TransactionSheet';

const BLOCKED_MESSAGE =
  'Hay una versión nueva de la app. Actualizala para seguir cargando movimientos.';

export function Panels({ panel }: { panel: Panel | null }) {
  const { accounts, categories, transactions, accountsById } = useLedger();
  const budgets = useData((s) => s.budgets);
  const recurring = useData((s) => s.recurring);
  const loaded = useData((s) => s.loaded);
  const writesBlocked = useData((s) => s.writesBlocked);
  const today = useToday();

  // El documento que se edita (sin lápidas). `undefined` si es nuevo o todavía no llegó.
  const id = panel?.id ?? null;
  const original =
    panel?.kind === 'transaction' && id
      ? transactions.find((tx) => tx.id === id && tx.deletedAt === null)
      : undefined;
  const account =
    panel?.kind === 'account' && id
      ? accounts.find((a) => a.id === id && a.deletedAt === null)
      : undefined;
  const category =
    panel?.kind === 'category' && id
      ? categories.find((c) => c.id === id && c.deletedAt === null)
      : undefined;

  // Un documento que no existe (o se eliminó en otro dispositivo): se cierra el panel.
  const collection =
    panel?.kind === 'transaction'
      ? 'transactions'
      : panel?.kind === 'account'
        ? 'accounts'
        : 'categories';
  const missing =
    panel !== null && id !== null && loaded[collection] && !original && !account && !category;
  useEffect(() => {
    if (missing) closePanel();
  }, [missing]);

  if (!panel || (id !== null && !original && !account && !category)) return null;

  const writer = writesBlocked ? null : session.writer();

  if (panel.kind === 'account') {
    return (
      <AccountSheet
        key={id ?? 'nueva'}
        accounts={accounts}
        original={account}
        onClose={closePanel}
        onSave={(fields) => {
          if (account) {
            const changes: AccountChanges = changedFields(account, {
              name: fields.name,
              kind: fields.kind,
            });
            writer?.updateAccount(account.id, changes);
          } else {
            writer?.createAccount(fields);
          }
          closePanel();
        }}
      />
    );
  }

  if (panel.kind === 'category') {
    const typeCheck = category
      ? canChangeCategoryType(category.id, { transactions, budgets, recurring })
      : null;
    return (
      <CategorySheet
        key={id ?? 'nueva'}
        categories={categories}
        original={category}
        typeLockedReason={typeCheck && !typeCheck.ok ? errorMessage(typeCheck.error) : null}
        routed
        onClose={closePanel}
        onSave={(fields) => {
          if (category) {
            const changes: CategoryChanges = changedFields(category, fields);
            writer?.updateCategory(category.id, changes);
          } else {
            writer?.createCategory(fields);
          }
          closePanel();
        }}
      />
    );
  }

  const locked = original ? canModifyTransaction(original, accountsById) : null;
  const lockedReason = writesBlocked
    ? BLOCKED_MESSAGE
    : locked && !locked.ok
      ? errorMessage(locked.error)
      : null;

  return (
    <TransactionSheet
      key={id ?? 'nuevo'}
      accounts={accounts}
      categories={categories}
      today={today}
      original={original}
      lockedReason={lockedReason}
      onClose={closePanel}
      onCreateAccount={() => {
        openPanel({ kind: 'account', id: null });
      }}
      onCreateCategory={(fields) => writer?.createCategory(fields) ?? null}
      onDelete={
        original
          ? () => {
              writer?.deleteTransaction(original.id);
              closePanel();
            }
          : undefined
      }
      onSave={(fields) => {
        if (original) writer?.updateTransaction(original, fields);
        else writer?.createTransaction(fields);
        closePanel();
      }}
    />
  );
}
