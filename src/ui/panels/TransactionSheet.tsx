// Panel de nuevo movimiento o de edición (SRS 6.7, ADR 0001): tipo, monto grande con teclado
// propio, categorías como botones, cuentas, fecha y descripción. Al crear, también se puede
// dictar (ADR 0023): la frase precarga el formulario y el usuario revisa y guarda.
//
// Es un componente "de presentación": recibe los datos y avisa con `onSave` qué guardar. No
// conoce Firestore ni el store, así se puede testear con Testing Library sin emuladores.

import { useEffect, useMemo, useState } from 'react';
import {
  amountKeyFromKeyboard,
  formatAmountInput,
  parseAmountInput,
  pressAmountKey,
  type AmountKey,
} from '../../domain/amountInput';
import { indexById } from '../../domain/collections';
import { errorMessage, type DomainError } from '../../domain/errors';
import { implicitRate } from '../../domain/exchange';
import type {
  Account,
  Category,
  Currency,
  LocalDate,
  Transaction,
  TransactionSource,
  TransactionType,
} from '../../domain/model';
import { currencySymbol, MINUS } from '../../domain/money';
import type { TransactionDraft, TransactionFields } from '../../domain/validation';
import { parsePhrase, type ParsedField } from '../../domain/voice/parsePhrase';
import type { CategoryFields } from '../../data/writes';
import { CategoryChips } from '../components/CategoryChips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Keypad } from '../components/Keypad';
import { Sheet } from '../components/Sheet';
import { speechErrorMessage, useSpeech } from '../voice/speech';
import { CategorySheet } from './CategorySheet';
import {
  accountOptions,
  buildTransaction,
  categoryOptions,
  changeAccount,
  changeType,
  destinationOptions,
  emptyForm,
  formFromDraft,
  formFromPhrase,
  formFromTransaction,
  type TransactionForm,
  type TransactionFormErrors,
} from './transactionForm';

const TYPES: { type: TransactionType; label: string; save: string }[] = [
  { type: 'expense', label: 'Gasto', save: 'Guardar gasto' },
  { type: 'income', label: 'Ingreso', save: 'Guardar ingreso' },
  { type: 'transfer', label: 'Transferir', save: 'Guardar transferencia' },
  { type: 'exchange', label: 'Cambio', save: 'Guardar cambio' },
];

export interface TransactionSheetProps {
  accounts: readonly Account[];
  categories: readonly Category[];
  today: LocalDate;
  /** El movimiento que se edita; sin él, se crea uno nuevo. */
  original?: Transaction | undefined;
  /** Datos para precargar un movimiento nuevo (por ejemplo, la ocurrencia de un recurrente). */
  initial?: TransactionDraft | undefined;
  /** Título del panel, si no es "Nuevo movimiento" o "Editar movimiento". */
  title?: string | undefined;
  /** Oculta el selector de tipo: al confirmar un recurrente, el tipo no cambia. */
  typeLocked?: boolean;
  /** Si no se puede modificar (usa una cuenta archivada, SRS 5.3), el motivo. */
  lockedReason?: string | null;
  /** Empezar a dictar al abrir (`dictar=1`, ADR 0023). */
  autoDictate?: boolean;
  /** `source` es `'voice'` si el formulario se precargó dictando. */
  onSave: (fields: TransactionFields, source: TransactionSource) => void;
  onClose: () => void;
  onCreateAccount: () => void;
  /** Crea una categoría desde el chip "+ Nueva" y devuelve su ID, para dejarla elegida. */
  onCreateCategory?: ((fields: CategoryFields) => string | null) | undefined;
  /** Elimina el movimiento que se edita (solo en edición). */
  onDelete?: (() => void) | undefined;
}

function FieldError({ error, id }: { error: DomainError | undefined; id: string }) {
  if (!error) return null;
  return (
    <p className="field-error" id={id}>
      {errorMessage(error)}
    </p>
  );
}

/** Un campo que se precargó dictando pero no se entendió (ADR 0023). */
function Unclear({ show }: { show: boolean }) {
  if (!show) return null;
  return <p className="field-unclear">No se entendió, revisalo.</p>;
}

/** Qué marca de "no se entendió" se borra cuando el usuario cambia cada campo. */
const UNCLEAR_FIELD: Partial<Record<keyof TransactionFormErrors, ParsedField>> = {
  amount: 'amount',
  accountId: 'account',
  toAccountId: 'toAccount',
  categoryId: 'category',
};

/** Lo último que se dictó y qué quedó para revisar. */
interface Dictation {
  heard: string;
  unclear: ParsedField[];
  /** Sonaba a un cambio de moneda, que no se puede dictar (ADR 0015). */
  exchange: boolean;
}

function accountLabel(account: Account): string {
  return `${account.name} · ${account.currency}`;
}

/** Monto mientras se escribe: `− $ 12.500,5`. */
function amountText(text: string, currency: Currency, type: TransactionType | null): string {
  const sign = type === 'expense' ? `${MINUS} ` : type === 'income' ? '+ ' : '';
  return `${sign}${currencySymbol(currency)} ${formatAmountInput(text)}`;
}

export function TransactionSheet({
  accounts,
  categories,
  today,
  original,
  initial,
  title: customTitle,
  typeLocked = false,
  lockedReason = null,
  autoDictate = false,
  onSave,
  onClose,
  onCreateAccount,
  onCreateCategory,
  onDelete,
}: TransactionSheetProps) {
  const origins = useMemo(() => accountOptions(accounts), [accounts]);
  const accountsById = useMemo(() => indexById(accounts), [accounts]);
  const categoriesById = useMemo(() => indexById(categories), [categories]);

  const [form, setForm] = useState<TransactionForm>(() =>
    original
      ? formFromTransaction(original)
      : initial
        ? formFromDraft(initial)
        : emptyForm(today, origins[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  /** Qué monto escribe el teclado: en un cambio de moneda hay dos. */
  const [target, setTarget] = useState<'amount' | 'toAmount'>('amount');
  /** Paneles que se abren encima de este, sin perder lo que ya se escribió. */
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dictation, setDictation] = useState<Dictation | null>(null);
  /** El formulario se precargó dictando: el movimiento se guarda con origen `voice`. */
  const [dictated, setDictated] = useState(false);

  // Nunca guarda solo (ADR 0015): precarga y espera a que el usuario toque Guardar.
  const speech = useSpeech((text) => {
    const parsed = parsePhrase(text, { accounts, categories, today });
    if (parsed.unsupported === 'exchange') {
      setDictation({ heard: text, unclear: [], exchange: true });
      return;
    }
    const result = formFromPhrase(parsed, form, accounts);
    setForm(result.form);
    setErrors({});
    setTarget('amount');
    setDictated(true);
    setDictation({ heard: text, unclear: result.unclear, exchange: false });
  });
  const canDictate = speech.supported && !original && !typeLocked && origins.length > 0;
  const { start: startDictation } = speech;
  useEffect(() => {
    if (autoDictate && canDictate) startDictation();
  }, [autoDictate, canDictate, startDictation]);
  const unclear = (field: ParsedField) => dictation?.unclear.includes(field) === true;
  function settle(fields: readonly ParsedField[]) {
    setDictation(
      (current) =>
        current && { ...current, unclear: current.unclear.filter((f) => !fields.includes(f)) },
    );
  }

  const keepCategoryId =
    original && (original.type === 'income' || original.type === 'expense')
      ? original.categoryId
      : undefined;
  const categoryChoices = categoryOptions(form, categories, keepCategoryId);
  const destinations = destinationOptions(form, accounts);
  const origin = accountsById.get(form.accountId);
  const destination = accountsById.get(form.toAccountId);
  const currency = origin?.currency ?? 'ARS';
  const isExchange = form.type === 'exchange';
  const typeInfo = TYPES.find((t) => t.type === form.type) ?? TYPES[0];

  function update(changes: Partial<TransactionForm>, fields: (keyof TransactionFormErrors)[]) {
    setForm((current) => ({ ...current, ...changes }));
    // El error de un campo se borra cuando el usuario lo cambia.
    setErrors((current) => withoutErrors(current, fields));
    settle(fields.flatMap((field) => UNCLEAR_FIELD[field] ?? []));
  }

  function press(key: AmountKey) {
    const field = isExchange ? target : 'amount';
    update({ [field]: pressAmountKey(form[field], key) }, [field]);
  }

  function selectType(type: TransactionType) {
    setForm((current) => changeType(current, type));
    setTarget('amount');
    setErrors({});
    settle(['type']);
  }

  function submit() {
    const result = buildTransaction(
      form,
      { accounts: accountsById, categories: categoriesById },
      original,
    );
    if (!result.ok) {
      setErrors(result.error);
      return;
    }
    onSave(result.value, dictated ? 'voice' : 'app');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    // Teclado físico (compu): los números van al monto, salvo que se esté escribiendo en un campo.
    const element = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = amountKeyFromKeyboard(event.key);
    if (!key) return;
    event.preventDefault();
    press(key);
  }

  const title = customTitle ?? (original ? 'Editar movimiento' : 'Nuevo movimiento');

  if (origins.length === 0 && !original) {
    return (
      <Sheet title={title} onClose={onClose} routed>
        <div className="empty">
          <p>Para cargar un movimiento, primero creá una cuenta (por ejemplo, Efectivo).</p>
          <button type="button" className="btn btn-primary" onClick={onCreateAccount}>
            Crear cuenta
          </button>
        </div>
      </Sheet>
    );
  }

  const rate =
    isExchange && destination
      ? implicitRate(
          { currency, amount: valueOf(form.amount) },
          { currency: destination.currency, amount: valueOf(form.toAmount) },
        )
      : null;

  const micButton = canDictate ? (
    <button
      type="button"
      className="icon-btn mic-btn"
      aria-label="Dictar movimiento"
      aria-pressed={speech.listening}
      onClick={speech.listening ? speech.stop : speech.start}
    >
      <Icon name="mic" size={22} />
    </button>
  ) : null;

  return (
    <Sheet title={title} onClose={onClose} onKeyDown={onKeyDown} routed actions={micButton}>
      {lockedReason && (
        <div className="notice" role="alert">
          <Icon name="warning" />
          <div className="notice-body">{lockedReason}</div>
        </div>
      )}

      {speech.listening && (
        <p className="voice-status" role="status">
          Te escucho… Por ejemplo: «gasté 5000 en el súper con efectivo».
        </p>
      )}
      {speech.error && (
        <div className="notice" role="alert">
          <Icon name="warning" />
          <div className="notice-body">{speechErrorMessage(speech.error)}</div>
        </div>
      )}
      {dictation?.exchange && (
        <div className="notice" role="alert">
          <Icon name="warning" />
          <div className="notice-body">
            Los cambios de moneda todavía no se pueden dictar. Elegí «Cambio» y cargalo a mano.
          </div>
        </div>
      )}
      {dictation && !dictation.exchange && (
        <p className="voice-heard">Escuché: «{dictation.heard}»</p>
      )}

      {!typeLocked && (
        <div className="segmented" role="group" aria-label="Tipo de movimiento">
          {TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              className={`tone-${type}`}
              aria-pressed={form.type === type}
              onClick={() => {
                selectType(type);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <Unclear show={unclear('type')} />

      {isExchange ? (
        <div className="exchange-amounts">
          <button
            type="button"
            className="amount-box"
            aria-pressed={target === 'amount'}
            aria-describedby={errors.amount ? 'error-amount' : undefined}
            onClick={() => {
              setTarget('amount');
            }}
          >
            <span className="field-label">Sale</span>
            <span className="num amount--expense">
              {amountText(form.amount, currency, 'expense')}
            </span>
          </button>
          <button
            type="button"
            className="amount-box"
            aria-pressed={target === 'toAmount'}
            aria-describedby={errors.toAmount ? 'error-toAmount' : undefined}
            onClick={() => {
              setTarget('toAmount');
            }}
          >
            <span className="field-label">Entra</span>
            <span className="num amount--income">
              {destination
                ? amountText(form.toAmount, destination.currency, 'income')
                : `+ ${formatAmountInput(form.toAmount)}`}
            </span>
          </button>
          <FieldError error={errors.amount} id="error-amount" />
          <FieldError error={errors.toAmount} id="error-toAmount" />
          <p className="field-hint exchange-rate" aria-live="polite">
            {rate ? rate.label : 'Escribí los dos montos para ver la cotización.'}
          </p>
        </div>
      ) : (
        <div className="amount-display">
          <p
            className={`num amount-big ${form.type === 'income' || form.type === 'expense' ? `amount--${form.type}` : ''}`}
            aria-label={`Monto: ${amountText(form.amount, currency, null)}`}
          >
            {amountText(form.amount, currency, form.type)}
          </p>
          {errors.amount ? (
            <FieldError error={errors.amount} id="error-amount" />
          ) : unclear('amount') ? (
            <Unclear show />
          ) : (
            <p className="field-hint">Coma o punto para los centavos</p>
          )}
        </div>
      )}

      {(form.type === 'income' || form.type === 'expense') && (
        <div className="field">
          <span className="section-label" id="categories-label">
            Categoría
          </span>
          {categoryChoices.length === 0 && (
            <p className="field-hint">
              No tenés categorías de {form.type === 'income' ? 'ingreso' : 'gasto'} activas.
            </p>
          )}
          <CategoryChips
            categories={categoryChoices}
            selectedId={form.categoryId}
            labelledBy="categories-label"
            onSelect={(categoryId) => {
              update({ categoryId }, ['categoryId']);
            }}
            onCreate={
              onCreateCategory && lockedReason === null
                ? () => {
                    setCreatingCategory(true);
                  }
                : undefined
            }
          />
          <FieldError error={errors.categoryId} id="error-categoryId" />
          <Unclear show={!errors.categoryId && unclear('category')} />
        </div>
      )}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {form.type === 'transfer' || isExchange ? 'Desde' : 'Cuenta'}
          </span>
          <select
            className="input"
            value={form.accountId}
            aria-invalid={errors.accountId ? true : undefined}
            onChange={(event) => {
              const accountId = event.target.value;
              setForm((current) => changeAccount(current, accountId, accounts));
              setErrors((current) => withoutErrors(current, ['accountId', 'toAccountId']));
              settle(['account']);
            }}
          >
            {origin && !origins.includes(origin) && (
              <option value={origin.id}>{accountLabel(origin)}</option>
            )}
            {origins.map((account) => (
              <option key={account.id} value={account.id}>
                {accountLabel(account)}
              </option>
            ))}
          </select>
          <FieldError error={errors.accountId} id="error-accountId" />
          <Unclear show={!errors.accountId && unclear('account')} />
        </label>

        {(form.type === 'transfer' || isExchange) && (
          <label className="field">
            <span className="field-label">Hacia</span>
            <select
              className="input"
              value={form.toAccountId}
              aria-invalid={errors.toAccountId ? true : undefined}
              onChange={(event) => {
                update({ toAccountId: event.target.value }, ['toAccountId']);
              }}
            >
              <option value="">
                {destinations.length === 0 ? 'No hay cuentas disponibles' : 'Elegí una cuenta'}
              </option>
              {destinations.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
            <FieldError error={errors.toAccountId} id="error-toAccountId" />
            <Unclear show={!errors.toAccountId && unclear('toAccount')} />
          </label>
        )}

        <label className="field">
          <span className="field-label">Fecha{form.date === today ? ' (hoy)' : ''}</span>
          <input
            className="input"
            type="date"
            value={form.date}
            required
            aria-invalid={errors.date ? true : undefined}
            onChange={(event) => {
              update({ date: event.target.value }, ['date']);
            }}
          />
          <FieldError error={errors.date} id="error-date" />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Descripción (opcional)</span>
        <input
          className="input"
          type="text"
          value={form.description}
          maxLength={200}
          aria-invalid={errors.description ? true : undefined}
          onChange={(event) => {
            update({ description: event.target.value }, ['description']);
          }}
        />
        <FieldError error={errors.description} id="error-description" />
      </label>

      <Keypad onKey={press} />

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={lockedReason !== null}
        onClick={submit}
      >
        {typeInfo?.save}
      </button>

      {original && onDelete && (
        <button
          type="button"
          className="btn btn-danger-text btn-block"
          disabled={lockedReason !== null}
          onClick={() => {
            setConfirmingDelete(true);
          }}
        >
          Eliminar movimiento
        </button>
      )}

      {creatingCategory && onCreateCategory && (
        <CategorySheet
          categories={categories}
          defaultType={form.type === 'income' ? 'income' : 'expense'}
          onClose={() => {
            setCreatingCategory(false);
          }}
          onSave={(fields) => {
            const id = onCreateCategory(fields);
            setCreatingCategory(false);
            if (id && fields.type === form.type) update({ categoryId: id }, ['categoryId']);
          }}
        />
      )}

      {confirmingDelete && onDelete && (
        <ConfirmDialog
          title="¿Eliminar este movimiento?"
          confirmLabel="Eliminar"
          danger
          onConfirm={onDelete}
          onClose={() => {
            setConfirmingDelete(false);
          }}
        >
          Los saldos se recalculan enseguida.
        </ConfirmDialog>
      )}
    </Sheet>
  );
}

function withoutErrors(
  errors: TransactionFormErrors,
  fields: readonly (keyof TransactionFormErrors)[],
): TransactionFormErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([field]) => !(fields as readonly string[]).includes(field)),
  );
}

/** Centavos de lo escrito, o 0 si todavía no es un monto válido (para la cotización). */
function valueOf(text: string): number {
  const result = parseAmountInput(text);
  return result.ok ? result.value : 0;
}
