// Panel de cuenta nueva o de edición (SRS 6.7): nombre, tipo de cuenta, moneda y saldo inicial.
// La moneda y el saldo inicial no se pueden cambiar después (SRS 4.2): al editar, se muestran
// de solo lectura.

import { useState } from 'react';
import { errorMessage, type DomainError } from '../../domain/errors';
import {
  ACCOUNT_KINDS,
  CURRENCIES,
  type Account,
  type AccountKind,
  type Currency,
} from '../../domain/model';
import { formatAmount, parseAmount } from '../../domain/money';
import { ACCOUNT_NAME_MAX, validateAccountName } from '../../domain/validation';
import type { AccountFields } from '../../data/writes';
import { Sheet } from '../components/Sheet';
import { ACCOUNT_KIND_LABELS } from '../format';

interface AccountSheetProps {
  accounts: readonly Account[];
  /** La cuenta que se edita; sin ella, se crea una nueva. */
  original?: Account | undefined;
  /** Al editar, solo cambian el nombre y el tipo de cuenta. */
  onSave: (fields: AccountFields) => void;
  onClose: () => void;
}

interface Errors {
  name?: DomainError;
  initialBalance?: DomainError;
}

export function AccountSheet({ accounts, original, onSave, onClose }: AccountSheetProps) {
  const [name, setName] = useState(original?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(original?.kind ?? 'cash');
  const [currency, setCurrency] = useState<Currency>(original?.currency ?? 'ARS');
  const [balance, setBalance] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const validName = validateAccountName(name, accounts, original?.id);
    if (original) {
      if (!validName.ok) {
        setErrors({ name: validName.error });
        return;
      }
      onSave({ ...original, name: validName.value, kind });
      return;
    }
    // Vacío = 0: la mayoría de las cuentas nuevas empiezan sin saldo.
    const initialBalance = parseAmount(balance.trim() === '' ? '0' : balance, { allowZero: true });
    if (!validName.ok || !initialBalance.ok) {
      setErrors({
        ...(validName.ok ? {} : { name: validName.error }),
        ...(initialBalance.ok ? {} : { initialBalance: initialBalance.error }),
      });
      return;
    }
    onSave({ name: validName.value, kind, currency, initialBalance: initialBalance.value });
  }

  return (
    <Sheet title={original ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <form className="sheet-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Nombre</span>
          <input
            className="input"
            type="text"
            value={name}
            maxLength={ACCOUNT_NAME_MAX}
            placeholder="Por ejemplo, Efectivo"
            aria-invalid={errors.name ? true : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setErrors(({ initialBalance }) => (initialBalance ? { initialBalance } : {}));
            }}
          />
          {errors.name && <p className="field-error">{errorMessage(errors.name)}</p>}
        </label>

        <label className="field">
          <span className="field-label">Tipo de cuenta</span>
          <select
            className="input"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as AccountKind);
            }}
          >
            {ACCOUNT_KINDS.map((value) => (
              <option key={value} value={value}>
                {ACCOUNT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        {original ? (
          <div className="field">
            <span className="field-label">Moneda y saldo inicial</span>
            <p className="num">
              {original.currency} · {formatAmount(original.initialBalance, original.currency)}
            </p>
            <p className="field-hint">
              El saldo inicial no puede modificarse. Para ajustar el saldo, cargá un ingreso o un
              gasto.
            </p>
          </div>
        ) : (
          <>
            <div className="field">
              <span className="field-label" id="currency-label">
                Moneda
              </span>
              <div className="segmented" role="group" aria-labelledby="currency-label">
                {CURRENCIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={currency === value}
                    onClick={() => {
                      setCurrency(value);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p className="field-hint">La moneda no se puede cambiar después.</p>
            </div>

            <label className="field">
              <span className="field-label">Saldo inicial</span>
              <input
                className="input num"
                type="text"
                inputMode="decimal"
                value={balance}
                placeholder="0"
                aria-invalid={errors.initialBalance ? true : undefined}
                onChange={(event) => {
                  setBalance(event.target.value);
                  setErrors(({ name }) => (name ? { name } : {}));
                }}
              />
              {errors.initialBalance ? (
                <p className="field-error">{errorMessage(errors.initialBalance)}</p>
              ) : (
                <p className="field-hint">
                  Lo que tiene la cuenta hoy. Después no se puede cambiar: los ajustes se cargan
                  como ingresos o gastos.
                </p>
              )}
            </label>
          </>
        )}

        <button type="submit" className="btn btn-primary btn-block">
          {original ? 'Guardar cambios' : 'Crear cuenta'}
        </button>
      </form>
    </Sheet>
  );
}
