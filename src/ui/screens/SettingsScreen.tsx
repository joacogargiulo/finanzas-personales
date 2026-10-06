// Ajustes (SRS 6.6): cuentas y categorías (editar, archivar, eliminar y restaurar),
// presupuestos, recurrentes, respaldo y exportación, apariencia, privacidad, cuenta de Google y
// borrar la cuenta.
//
// Las reglas de archivar, eliminar y restaurar son del dominio (src/domain/lifecycle.ts,
// ADR 0005 y 0009). Acá solo se decide qué diálogo mostrar.

import { useMemo, useState } from 'react';
import { categoryIcon } from '../../domain/categoryStyle';
import { alive, compareNames, isActive, sortAccounts } from '../../domain/collections';
import { errorMessage } from '../../domain/errors';
import {
  accountUsage,
  activeRecurringUsing,
  canArchiveAccount,
  canDelete,
  canRestoreAccount,
  canRestoreCategory,
  categoryUsage,
  type UserData,
} from '../../domain/lifecycle';
import type { Account, Category } from '../../domain/model';
import {
  ACCOUNT_NAME_MAX,
  CATEGORY_NAME_MAX,
  validateAccountName,
  validateCategoryName,
} from '../../domain/validation';
import type { SessionUser } from '../../data/auth';
import { THEMES, type Theme } from '../../data/preferences';
import { useHideBalances } from '../app/balanceVisibility';
import { useData, useLedger } from '../app/hooks';
import { openPanel } from '../app/navigation';
import { SignOutButton } from '../app/SignOutButton';
import { setTheme, useTheme } from '../app/theme';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { RenameDialog } from '../components/RenameDialog';
import { RowMenu } from '../components/RowMenu';
import { categoryTone } from '../categoryTone';
import { ACCOUNT_KIND_LABELS } from '../format';
import { session } from '../session';
import { BackupSettings } from './BackupSettings';
import { BudgetsSettings } from './BudgetsSettings';
import { DeleteAccountSettings } from './DeleteAccountSettings';
import { PrivacySettings } from './PrivacySettings';
import { RecurringSettings } from './RecurringSettings';

const THEME_LABELS: Record<Theme, string> = {
  auto: 'Automático',
  light: 'Claro',
  dark: 'Oscuro',
};

type Dialog =
  | { kind: 'archiveAccount'; account: Account }
  | { kind: 'deleteAccount'; account: Account }
  | { kind: 'restoreAccount'; account: Account; reason: string }
  | { kind: 'archiveCategory'; category: Category }
  | { kind: 'deleteCategory'; category: Category }
  | { kind: 'restoreCategory'; category: Category; reason: string };

function byName(a: Category, b: Category): number {
  return compareNames(a.name, b.name);
}

export function SettingsScreen({ user }: { user: SessionUser }) {
  const theme = useTheme();
  const { accounts, categories, transactions, balances } = useLedger();
  const budgets = useData((s) => s.budgets);
  const recurring = useData((s) => s.recurring);
  const writesBlocked = useData((s) => s.writesBlocked);
  const hideBalances = useHideBalances();
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const activeAccounts = useMemo(() => sortAccounts(accounts.filter(isActive)), [accounts]);
  const archivedAccounts = useMemo(
    () => sortAccounts(alive(accounts).filter((a) => !isActive(a))),
    [accounts],
  );
  const activeCategories = useMemo(() => categories.filter(isActive).sort(byName), [categories]);
  const archivedCategories = useMemo(
    () =>
      alive(categories)
        .filter((c) => !isActive(c))
        .sort(byName),
    [categories],
  );

  const writer = () => (writesBlocked ? null : session.writer());

  function restoreAccount(account: Account) {
    const check = canRestoreAccount(account, accounts);
    if (check.ok) writer()?.restoreAccount(account.id);
    else setDialog({ kind: 'restoreAccount', account, reason: errorMessage(check.error) });
  }

  function restoreCategory(category: Category) {
    const check = canRestoreCategory(category, categories);
    if (check.ok) writer()?.restoreCategory(category.id);
    else setDialog({ kind: 'restoreCategory', category, reason: errorMessage(check.error) });
  }

  return (
    <>
      <section className="card" aria-labelledby="accounts-settings-title">
        <div className="card-header">
          <h2 id="accounts-settings-title" className="card-title">
            Cuentas
          </h2>
          <button
            type="button"
            className="btn-link"
            disabled={writesBlocked}
            onClick={() => {
              openPanel({ kind: 'account', id: null });
            }}
          >
            + Añadir cuenta
          </button>
        </div>
        {activeAccounts.length === 0 ? (
          <p className="empty">No tenés cuentas activas.</p>
        ) : (
          <ul className="list">
            {activeAccounts.map((account) => (
              <li key={account.id} className="list-row">
                <span className="badge" title={ACCOUNT_KIND_LABELS[account.kind]}>
                  <Icon name={account.kind} />
                </span>
                <span className="row-main">
                  <span className="row-title">{account.name}</span>
                  <span className="row-subtitle">
                    {ACCOUNT_KIND_LABELS[account.kind]} · {account.currency}
                  </span>
                </span>
                <Money
                  cents={balances.get(account.id) ?? account.initialBalance}
                  currency={account.currency}
                  masked={hideBalances}
                />
                <RowMenu
                  label={`Acciones de ${account.name}`}
                  disabled={writesBlocked}
                  items={[
                    {
                      label: 'Editar',
                      onSelect: () => {
                        openPanel({ kind: 'account', id: account.id });
                      },
                    },
                    {
                      label: 'Archivar',
                      onSelect: () => {
                        setDialog({ kind: 'archiveAccount', account });
                      },
                    },
                    {
                      label: 'Eliminar',
                      danger: true,
                      onSelect: () => {
                        setDialog({ kind: 'deleteAccount', account });
                      },
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
        {archivedAccounts.length > 0 && (
          <details className="archived">
            <summary>Cuentas archivadas ({archivedAccounts.length})</summary>
            <ul className="list">
              {archivedAccounts.map((account) => (
                <li key={account.id} className="list-row">
                  <span className="row-main">
                    <span className="row-title">{account.name}</span>
                    <span className="row-subtitle">{account.currency}</span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={writesBlocked}
                    onClick={() => {
                      restoreAccount(account);
                    }}
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card" aria-labelledby="categories-settings-title">
        <div className="card-header">
          <h2 id="categories-settings-title" className="card-title">
            Categorías
          </h2>
          <button
            type="button"
            className="btn-link"
            disabled={writesBlocked}
            onClick={() => {
              openPanel({ kind: 'category', id: null });
            }}
          >
            + Añadir categoría
          </button>
        </div>
        {(['expense', 'income'] as const).map((type) => {
          const list = activeCategories.filter((c) => c.type === type);
          const heading = type === 'expense' ? 'Gastos' : 'Ingresos';
          return (
            <div key={type} className="category-group">
              <h3 className="section-label">{heading}</h3>
              {list.length === 0 ? (
                <p className="field-hint">No tenés categorías de {heading.toLowerCase()}.</p>
              ) : (
                <ul className="list">
                  {list.map((category) => (
                    <li key={category.id} className="list-row">
                      <span className="badge" style={categoryTone(category.color)}>
                        <Icon name={categoryIcon(category.icon)} />
                      </span>
                      <span className="row-main">
                        <span className="row-title">{category.name}</span>
                      </span>
                      <RowMenu
                        label={`Acciones de ${category.name}`}
                        disabled={writesBlocked}
                        items={[
                          {
                            label: 'Editar',
                            onSelect: () => {
                              openPanel({ kind: 'category', id: category.id });
                            },
                          },
                          {
                            label: 'Archivar',
                            onSelect: () => {
                              setDialog({ kind: 'archiveCategory', category });
                            },
                          },
                          {
                            label: 'Eliminar',
                            danger: true,
                            onSelect: () => {
                              setDialog({ kind: 'deleteCategory', category });
                            },
                          },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {archivedCategories.length > 0 && (
          <details className="archived">
            <summary>Categorías archivadas ({archivedCategories.length})</summary>
            <ul className="list">
              {archivedCategories.map((category) => (
                <li key={category.id} className="list-row">
                  <span className="badge" style={categoryTone(category.color)}>
                    <Icon name={categoryIcon(category.icon)} />
                  </span>
                  <span className="row-main">
                    <span className="row-title">{category.name}</span>
                    <span className="row-subtitle">
                      {category.type === 'expense' ? 'Gasto' : 'Ingreso'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={writesBlocked}
                    onClick={() => {
                      restoreCategory(category);
                    }}
                  >
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <BudgetsSettings />

      <RecurringSettings />

      <BackupSettings />

      <section className="card" aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="card-title">
          Apariencia
        </h2>
        <div className="segmented" role="group" aria-label="Tema">
          {THEMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(user.uid, value);
              }}
            >
              {THEME_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="field-hint">
          Automático sigue la configuración del dispositivo. Se guarda solo en este dispositivo.
        </p>
      </section>

      <PrivacySettings />

      <section className="card" aria-labelledby="google-title">
        <h2 id="google-title" className="card-title">
          Cuenta de Google
        </h2>
        <div>
          <p className="menu-name">{user.displayName ?? 'Sin nombre'}</p>
          <p className="menu-email">{user.email}</p>
        </div>
        <SignOutButton />
      </section>

      <DeleteAccountSettings />

      {dialog && (
        <SettingsDialog
          key={dialog.kind}
          dialog={dialog}
          accounts={accounts}
          categories={categories}
          balances={balances}
          userData={{ transactions, budgets, recurring }}
          onChange={setDialog}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

interface SettingsDialogProps {
  dialog: Dialog;
  accounts: readonly Account[];
  categories: readonly Category[];
  balances: ReadonlyMap<string, number>;
  userData: UserData;
  onClose: () => void;
  onChange: (dialog: Dialog) => void;
}

/** El diálogo de cada acción, según las reglas del dominio. */
function SettingsDialog(props: SettingsDialogProps) {
  const { dialog, accounts, categories, balances, userData, onClose, onChange } = props;
  const writer = session.writer();
  const done = (action: () => void) => () => {
    action();
    onClose();
  };

  switch (dialog.kind) {
    case 'archiveAccount': {
      const { account } = dialog;
      const check = canArchiveAccount(account, balances.get(account.id) ?? account.initialBalance);
      if (!check.ok) {
        // TC-06: con saldo, no se archiva.
        return (
          <ConfirmDialog title="No se puede archivar" onClose={onClose}>
            {errorMessage(check.error)}
          </ConfirmDialog>
        );
      }
      const recurringCount = activeRecurringUsing(account.id, userData.recurring).length;
      return (
        <ConfirmDialog
          title={`¿Archivar ${account.name}?`}
          confirmLabel="Archivar"
          requireText={account.name}
          onClose={onClose}
          onConfirm={done(() => writer?.archiveAccount(account.id))}
        >
          <p>
            Deja de aparecer en Inicio y al cargar movimientos. Sus movimientos siguen en el
            historial. Podés restaurarla desde Ajustes cuando quieras.
          </p>
          {recurringCount > 0 && (
            <p className="warn-text">
              La usan {recurringCount} movimientos recurrentes: sus pendientes no se van a poder
              confirmar mientras esté archivada.
            </p>
          )}
        </ConfirmDialog>
      );
    }

    case 'deleteAccount': {
      const { account } = dialog;
      const check = canDelete(accountUsage(account.id, userData));
      if (!check.ok) {
        return (
          <ConfirmDialog
            title="No se puede eliminar"
            confirmLabel="Archivar"
            onClose={onClose}
            onConfirm={() => {
              onChange({ kind: 'archiveAccount', account });
            }}
          >
            {errorMessage(check.error)}
          </ConfirmDialog>
        );
      }
      return (
        <ConfirmDialog
          title={`¿Eliminar ${account.name}?`}
          confirmLabel="Eliminar"
          danger
          onClose={onClose}
          onConfirm={done(() => writer?.deleteAccount(account.id))}
        >
          La cuenta no tiene movimientos. Se elimina en todos tus dispositivos.
        </ConfirmDialog>
      );
    }

    case 'restoreAccount': {
      const { account } = dialog;
      return (
        <RenameDialog
          title={`Restaurar ${account.name}`}
          reason={dialog.reason}
          initialName={account.name}
          maxLength={ACCOUNT_NAME_MAX}
          validate={(name) => validateAccountName(name, accounts, account.id)}
          onClose={onClose}
          onConfirm={(name) => {
            writer?.restoreAccount(account.id, name);
            onClose();
          }}
        />
      );
    }

    case 'archiveCategory': {
      const { category } = dialog;
      const recurringCount = activeRecurringUsing(category.id, userData.recurring).length;
      const hasBudget = userData.budgets.some(
        (b) => b.deletedAt === null && b.categoryId === category.id,
      );
      return (
        <ConfirmDialog
          title={`¿Archivar ${category.name}?`}
          confirmLabel="Archivar"
          requireText={category.name}
          onClose={onClose}
          onConfirm={done(() => writer?.archiveCategory(category.id))}
        >
          <p>
            Deja de aparecer al cargar movimientos. Los saldos no cambian y sus movimientos siguen
            en el historial. Podés restaurarla desde Ajustes cuando quieras.
          </p>
          {hasBudget && <p>Su presupuesto se oculta mientras esté archivada.</p>}
          {recurringCount > 0 && (
            <p className="warn-text">
              La usan {recurringCount} movimientos recurrentes: sus pendientes no se van a poder
              confirmar mientras esté archivada.
            </p>
          )}
        </ConfirmDialog>
      );
    }

    case 'deleteCategory': {
      const { category } = dialog;
      const check = canDelete(categoryUsage(category.id, userData));
      if (!check.ok) {
        return (
          <ConfirmDialog
            title="No se puede eliminar"
            confirmLabel="Archivar"
            onClose={onClose}
            onConfirm={() => {
              onChange({ kind: 'archiveCategory', category });
            }}
          >
            {errorMessage(check.error)}
          </ConfirmDialog>
        );
      }
      return (
        <ConfirmDialog
          title={`¿Eliminar ${category.name}?`}
          confirmLabel="Eliminar"
          danger
          onClose={onClose}
          onConfirm={done(() => writer?.deleteCategory(category.id))}
        >
          La categoría no tiene movimientos. Se elimina en todos tus dispositivos.
        </ConfirmDialog>
      );
    }

    case 'restoreCategory': {
      const { category } = dialog;
      return (
        <RenameDialog
          title={`Restaurar ${category.name}`}
          reason={dialog.reason}
          initialName={category.name}
          maxLength={CATEGORY_NAME_MAX}
          validate={(name) => validateCategoryName(name, category.type, categories, category.id)}
          onClose={onClose}
          onConfirm={(name) => {
            writer?.restoreCategory(category.id, name);
            onClose();
          }}
        />
      );
    }
  }
}
