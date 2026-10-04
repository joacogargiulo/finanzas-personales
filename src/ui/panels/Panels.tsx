// Abre el panel que indica la dirección (ADR 0018) y lo conecta con los datos y las escrituras.
// Guardar nunca espera a Firestore (CLAUDE.md, regla 3): el panel se cierra enseguida y el
// cambio aparece en la pantalla por el listener a la caché (ADR 0016).

import { useEffect, useMemo } from 'react';
import { budgetId } from '../../domain/budgets';
import { isActive } from '../../domain/collections';
import { errorMessage } from '../../domain/errors';
import { canChangeCategoryType } from '../../domain/lifecycle';
import { CURRENCIES } from '../../domain/model';
import {
  canConfirm,
  occurrenceDraft,
  parseOccurrenceId,
  pendingOccurrences,
} from '../../domain/recurring';
import { canModifyTransaction } from '../../domain/validation';
import { changedFields, type AccountChanges, type CategoryChanges } from '../../data/writes';
import { useData, useLedger, useToday } from '../app/hooks';
import { closePanel, openPanel } from '../app/navigation';
import type { Panel } from '../app/route';
import { session } from '../session';
import { AccountSheet } from './AccountSheet';
import { BudgetSheet } from './BudgetSheet';
import { CategorySheet } from './CategorySheet';
import { RecurringSheet } from './RecurringSheet';
import { TransactionSheet } from './TransactionSheet';

const BLOCKED_MESSAGE =
  'Hay una versión nueva de la app. Actualizala para seguir cargando movimientos.';

export function Panels({ panel }: { panel: Panel | null }) {
  const { accounts, categories, transactions, accountsById, categoriesById } = useLedger();
  const budgets = useData((s) => s.budgets);
  const recurring = useData((s) => s.recurring);
  const loaded = useData((s) => s.loaded);
  const writesBlocked = useData((s) => s.writesBlocked);
  const today = useToday();

  // Monedas para un presupuesto: las que tienen alguna cuenta activa.
  const currencies = useMemo(
    () => CURRENCIES.filter((c) => accounts.some((a) => isActive(a) && a.currency === c)),
    [accounts],
  );

  // El documento que se edita (sin lápidas). `undefined` si es nuevo o todavía no llegó.
  const id = panel?.id ?? null;
  const kind = panel?.kind ?? null;
  const find = <T extends { id: string; deletedAt: number | null }>(docs: readonly T[]) =>
    id === null ? undefined : docs.find((doc) => doc.id === id && doc.deletedAt === null);
  const original = kind === 'transaction' ? find(transactions) : undefined;
  const account = kind === 'account' ? find(accounts) : undefined;
  const category = kind === 'category' ? find(categories) : undefined;
  const budget = kind === 'budget' ? find(budgets) : undefined;
  const recurringDoc = kind === 'recurring' ? find(recurring) : undefined;

  // Confirmar un pendiente: el ID es el del movimiento a crear (`rec_{recurrente}_{fecha}`).
  // Solo vale si esa fecha sigue pendiente: si otro dispositivo ya la confirmó, no.
  const occurrence = useMemo(() => {
    if (kind !== 'occurrence' || id === null) return undefined;
    const parsed = parseOccurrenceId(id);
    const source = parsed && recurring.find((r) => r.id === parsed.recurringId);
    if (!parsed || !source || !pendingOccurrences(source, today).includes(parsed.date)) {
      return undefined;
    }
    if (!canConfirm(source, accountsById, categoriesById).ok) return undefined;
    return { recurring: source, date: parsed.date };
  }, [kind, id, recurring, today, accountsById, categoriesById]);

  const found = original ?? account ?? category ?? budget ?? recurringDoc ?? occurrence;

  // Un documento que no existe (o se eliminó en otro dispositivo): se cierra el panel.
  const collection = {
    transaction: 'transactions',
    account: 'accounts',
    category: 'categories',
    budget: 'budgets',
    recurring: 'recurring',
    occurrence: 'recurring',
  } as const;
  const missing = kind !== null && id !== null && loaded[collection[kind]] && !found;
  useEffect(() => {
    if (missing) closePanel();
  }, [missing]);

  if (!panel || (id !== null && !found)) return null;

  const writer = writesBlocked ? null : session.writer();

  if (panel.kind === 'budget') {
    return (
      <BudgetSheet
        key={id ?? 'nuevo'}
        categories={categories}
        budgets={budgets}
        currencies={currencies}
        original={budget}
        onClose={closePanel}
        onSave={(draft) => {
          // Si es nuevo, `existing` es el documento con ese ID aunque sea una lápida (se revive).
          const existing =
            budget ?? budgets.find((b) => b.id === budgetId(draft.categoryId, draft.currency));
          writer?.saveBudget(draft, existing);
          closePanel();
        }}
      />
    );
  }

  if (panel.kind === 'recurring') {
    return (
      <RecurringSheet
        key={id ?? 'nuevo'}
        accounts={accounts}
        categories={categories}
        today={today}
        original={recurringDoc}
        onClose={closePanel}
        onSave={(fields) => {
          if (recurringDoc) writer?.updateRecurring(recurringDoc, fields);
          else writer?.createRecurring(fields);
          closePanel();
        }}
      />
    );
  }

  if (panel.kind === 'occurrence' && occurrence) {
    return (
      <TransactionSheet
        key={id ?? ''}
        accounts={accounts}
        categories={categories}
        today={today}
        initial={occurrenceDraft(occurrence.recurring, occurrence.date)}
        title="Confirmar recurrente"
        typeLocked
        lockedReason={writesBlocked ? BLOCKED_MESSAGE : null}
        onClose={closePanel}
        onCreateAccount={() => {
          openPanel({ kind: 'account', id: null });
        }}
        onSave={(fields) => {
          writer?.confirmOccurrence(occurrence.recurring, occurrence.date, fields);
          closePanel();
        }}
      />
    );
  }

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
