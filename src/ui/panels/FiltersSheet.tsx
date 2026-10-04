// Filtros de Movimientos (SRS 6.4): cuenta (incluidas las archivadas, marcadas), categoría
// (deshabilitada para transferencias y cambios) y rango de fechas. El tipo se elige con los
// botones de la pantalla. Los cambios se aplican al tocar "Aplicar".

import { useState } from 'react';
import { alive, compareNames, sortAccounts } from '../../domain/collections';
import type { Account, Category } from '../../domain/model';
import {
  EMPTY_FILTERS,
  isCategoryFilterEnabled,
  type TransactionFilters,
} from '../../domain/search';
import { Sheet } from '../components/Sheet';

interface FiltersSheetProps {
  filters: TransactionFilters;
  accounts: readonly Account[];
  categories: readonly Category[];
  onApply: (filters: TransactionFilters) => void;
  onClose: () => void;
}

function archivedSuffix(doc: { archivedAt: number | null }): string {
  return doc.archivedAt === null ? '' : ' (archivada)';
}

export function FiltersSheet({
  filters,
  accounts,
  categories,
  onApply,
  onClose,
}: FiltersSheetProps) {
  const [draft, setDraft] = useState(filters);
  const categoryEnabled = isCategoryFilterEnabled(draft.type);

  const accountChoices = sortAccounts(alive(accounts));
  const categoryChoices = alive(categories)
    .filter((c) => draft.type === null || !categoryEnabled || c.type === draft.type)
    .sort((a, b) =>
      a.type === b.type ? compareNames(a.name, b.name) : a.type === 'expense' ? -1 : 1,
    );

  function set(changes: Partial<TransactionFilters>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  return (
    <Sheet title="Filtros" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <label className="field">
          <span className="field-label">Cuenta</span>
          <select
            className="input"
            value={draft.accountId ?? ''}
            onChange={(event) => {
              set({ accountId: event.target.value || null });
            }}
          >
            <option value="">Todas las cuentas</option>
            {accountChoices.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.currency}
                {archivedSuffix(account)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Categoría</span>
          <select
            className="input"
            value={categoryEnabled ? (draft.categoryId ?? '') : ''}
            disabled={!categoryEnabled}
            onChange={(event) => {
              set({ categoryId: event.target.value || null });
            }}
          >
            <option value="">Todas las categorías</option>
            {categoryChoices.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {category.type === 'expense' ? 'Gasto' : 'Ingreso'}
                {archivedSuffix(category)}
              </option>
            ))}
          </select>
          {!categoryEnabled && (
            <span className="field-hint">
              Las transferencias y los cambios de moneda no tienen categoría.
            </span>
          )}
        </label>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Desde</span>
            <input
              className="input"
              type="date"
              value={draft.from ?? ''}
              max={draft.to ?? undefined}
              onChange={(event) => {
                set({ from: event.target.value || null });
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">Hasta</span>
            <input
              className="input"
              type="date"
              value={draft.to ?? ''}
              min={draft.from ?? undefined}
              onChange={(event) => {
                set({ to: event.target.value || null });
              }}
            />
          </label>
        </div>

        <div className="dialog-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              onApply({ ...EMPTY_FILTERS, text: draft.text });
            }}
          >
            Limpiar filtros
          </button>
          <button type="submit" className="btn btn-primary">
            Aplicar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
