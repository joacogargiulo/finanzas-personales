// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeAccount, makeCategory, makeExpense } from '../../domain/testing/factories';
import { TransactionSheet, type TransactionSheetProps } from './TransactionSheet';

const bank = makeAccount({ id: 'bank', name: 'Banco', currency: 'ARS' });
const cash = makeAccount({ id: 'cash', name: 'Efectivo', currency: 'ARS' });
const dollars = makeAccount({ id: 'usd', name: 'Caja dólares', currency: 'USD' });
const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
const salary = makeCategory({ id: 'salary', name: 'Salario', type: 'income' });

function setup(props: Partial<TransactionSheetProps> = {}) {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onCreateAccount: vi.fn() };
  render(
    <TransactionSheet
      accounts={[cash, bank, dollars]}
      categories={[food, salary]}
      today="2026-10-03"
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

/** Escribe un monto con el teclado de la pantalla. */
async function typeAmount(user: ReturnType<typeof userEvent.setup>, text: string) {
  for (const char of text) {
    const name = char === ',' ? 'Coma decimal' : char;
    await user.click(screen.getByRole('button', { name }));
  }
}

// El flujo principal: cargar un gasto con el teclado propio (TC-01).
describe('nuevo gasto', () => {
  it('guarda el gasto con el monto en centavos y la primera cuenta', async () => {
    const { onSave, user } = setup();
    await typeAmount(user, '1500,5');
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('− $ 1.500,5');

    await user.click(screen.getByRole('button', { name: 'Comida' }));
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(onSave).toHaveBeenCalledWith(
      {
        type: 'expense',
        amount: 150050,
        date: '2026-10-03',
        description: '',
        accountId: 'bank', // las cuentas se ordenan por moneda y nombre: Banco va primero
        categoryId: 'food',
      },
      'app', // origen: cargado a mano
    );
  });

  it('muestra los errores junto a cada campo y no guarda', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(screen.getByText('Ingresá un monto.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('acepta el teclado físico de la compu (el punto vale como coma)', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    for (const key of ['2', '5', '.', '7', '5']) fireEvent.keyDown(dialog, { key });
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 25,75');
  });
});

// SRS 6.7: al cambiar el tipo se limpian los campos que dejan de aplicar.
describe('cambiar de tipo', () => {
  it('de gasto a ingreso cambia las categorías y limpia la elegida', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Comida' }));
    await user.click(screen.getByRole('button', { name: 'Ingreso' }));

    expect(screen.queryByRole('button', { name: 'Comida' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salario' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Guardar ingreso' })).toBeInTheDocument();
  });

  it('transferencia desde una cuenta en dólares: no ofrece cuentas en pesos (TC-03)', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Transferir' }));
    await user.selectOptions(screen.getByLabelText('Desde'), 'usd');

    const destination = screen.getByLabelText('Hacia');
    const options = within(destination)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['No hay cuentas disponibles']);
  });

  it('cambio de moneda: muestra la cotización implícita (TC-05)', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cambio' }));
    await user.selectOptions(screen.getByLabelText('Hacia'), 'usd');

    await typeAmount(user, '130000');
    await user.click(screen.getByRole('button', { name: /^Entra/ }));
    await typeAmount(user, '100');

    expect(screen.getByText('1 USD = $ 1.300,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exchange', amount: 13_000_000, toAmount: 10_000 }),
      'app',
    );
  });
});

describe('edición', () => {
  it('precarga el movimiento y guarda los cambios (TC-04)', async () => {
    const original = makeExpense({ accountId: 'cash', categoryId: 'food', amount: 30000 });
    const { onSave, user } = setup({ original });

    expect(screen.getByRole('dialog', { name: 'Editar movimiento' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 300');
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await typeAmount(user, '500');
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000 }), 'app');
  });

  it('bloquea el guardado con la explicación si usa una cuenta archivada', () => {
    const original = makeExpense({ accountId: 'cash', categoryId: 'food' });
    setup({ original, lockedReason: 'Este movimiento usa la cuenta archivada Efectivo.' });

    expect(screen.getByRole('alert')).toHaveTextContent('cuenta archivada Efectivo');
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeDisabled();
  });
});

// Eliminar desde el panel de edición, con confirmación simple (SRS 6.7).
describe('eliminar', () => {
  it('pide confirmación antes de eliminar', async () => {
    const original = makeExpense({ accountId: 'cash', categoryId: 'food' });
    const onDelete = vi.fn();
    const { user } = setup({ original, onDelete });

    await user.click(screen.getByRole('button', { name: 'Eliminar movimiento' }));
    expect(onDelete).not.toHaveBeenCalled();
    const confirm = screen.getByRole('dialog', { name: '¿Eliminar este movimiento?' });
    await user.click(within(confirm).getByRole('button', { name: 'Eliminar' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('un movimiento nuevo no tiene "Eliminar"', () => {
    setup({ onDelete: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Eliminar movimiento' })).not.toBeInTheDocument();
  });
});

// "+ Nueva" crea una categoría sin perder lo que ya se escribió, y la deja elegida.
describe('categoría nueva', () => {
  it('crea la categoría y la deja elegida', async () => {
    const onCreateCategory = vi.fn(() => 'pets');
    const { user } = setup({
      onCreateCategory,
      categories: [food, salary, makeCategory({ id: 'pets', name: 'Mascotas', type: 'expense' })],
    });
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '+ Nueva' }));

    const sheet = screen.getByRole('dialog', { name: 'Nueva categoría' });
    await user.type(within(sheet).getByLabelText('Nombre'), 'Regalos');
    await user.click(within(sheet).getByRole('button', { name: 'Crear categoría' }));

    expect(onCreateCategory).toHaveBeenCalledWith(expect.objectContaining({ name: 'Regalos' }));
    expect(screen.getByRole('button', { name: 'Mascotas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 5');
  });
});

describe('sin cuentas', () => {
  it('invita a crear la primera cuenta', async () => {
    const { onCreateAccount, user } = setup({ accounts: [] });
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(onCreateAccount).toHaveBeenCalled();
  });
});

// Confirmar un recurrente (Fase 5): el panel llega precargado con la ocurrencia y sin selector
// de tipo. El usuario puede ajustar el monto, la fecha o la descripción antes de guardar.
describe('precargado (confirmar un recurrente)', () => {
  const initial = {
    type: 'expense' as const,
    amount: 250_000_00,
    date: '2026-10-01',
    description: 'Alquiler',
    accountId: 'cash',
    categoryId: 'food',
  };

  it('muestra los datos del recurrente y guarda lo que ajustó el usuario', async () => {
    const { onSave, user } = setup({ initial, title: 'Confirmar recurrente', typeLocked: true });
    expect(screen.getByRole('dialog', { name: 'Confirmar recurrente' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Tipo de movimiento' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 250.000');
    expect(screen.getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(onSave).toHaveBeenCalledWith({ ...initial, amount: 25_000_00 }, 'app');
  });
});

// Dictado (ADR 0023). jsdom no tiene micrófono: se instala un reconocimiento de voz falso que
// imita a `webkitSpeechRecognition` de Chrome, y el test decide qué "escuchó".
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = true;
  interimResults = true;
  maxAlternatives = 0;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  /** El usuario dijo `text` y se calló. */
  say(text: string) {
    act(() => {
      this.onresult?.({ results: [[{ transcript: text }]] });
      this.onend?.();
    });
  }
  fail(error: string) {
    act(() => {
      this.onerror?.({ error });
      this.onend?.();
    });
  }
}

/** El reconocimiento que está escuchando ahora. */
function recognition(): FakeRecognition {
  const last = FakeRecognition.last;
  if (!last) throw new Error('No se empezó a escuchar');
  return last;
}

describe('dictado', () => {
  // "súper" es sinónimo de la categoría inicial Comida, que tiene ID fijo.
  const seedFood = makeCategory({ id: 'seed_comida', name: 'Comida', type: 'expense' });

  function withSpeech() {
    FakeRecognition.last = null;
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function dictate(text: string, props: Partial<TransactionSheetProps> = {}) {
    withSpeech();
    const result = setup({ categories: [seedFood, salary], ...props });
    await result.user.click(screen.getByRole('button', { name: 'Dictar movimiento' }));
    expect(recognition().lang).toBe('es-AR');
    recognition().say(text);
    return result;
  }

  it('el botón aparece solo si el navegador sabe dictar, y solo al crear', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Dictar movimiento' })).not.toBeInTheDocument();
  });

  it('no aparece al editar ni al confirmar un recurrente', () => {
    withSpeech();
    const { unmount } = render(
      <TransactionSheet
        accounts={[cash]}
        categories={[food]}
        today="2026-10-03"
        original={makeExpense({ accountId: 'cash', categoryId: 'food' })}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onCreateAccount={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Dictar movimiento' })).not.toBeInTheDocument();
    unmount();
    setup({ typeLocked: true });
    expect(screen.queryByRole('button', { name: 'Dictar movimiento' })).not.toBeInTheDocument();
  });

  it('precarga el formulario, no guarda solo y guarda con origen voice', async () => {
    const { onSave, user } = await dictate('gasté dieciocho mil en el súper con efectivo');

    expect(
      screen.getByText('Escuché: «gasté dieciocho mil en el súper con efectivo»'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 18.000');
    expect(screen.getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Cuenta' })).toHaveValue('cash');
    expect(onSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'expense', amount: 1_800_000, accountId: 'cash' }),
      'voice',
    );
  });

  it('marca lo que no se entendió, y la marca se va al corregirlo', async () => {
    const { user } = await dictate('gasté en el súper con efectivo');

    expect(screen.getByText('No se entendió, revisalo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '5' }));
    expect(screen.queryByText('No se entendió, revisalo.')).not.toBeInTheDocument();
  });

  it('un cambio de moneda no se dicta: avisa y no toca el formulario', async () => {
    await dictate('compré 100 dólares');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Los cambios de moneda todavía no se pueden dictar',
    );
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 0');
  });

  it('explica en castellano si el micrófono no está permitido', async () => {
    withSpeech();
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Dictar movimiento' }));
    recognition().fail('not-allowed');

    expect(screen.getByRole('alert')).toHaveTextContent('Permití el uso del micrófono');
  });

  it('con autoDictate empieza a escuchar al abrir', () => {
    withSpeech();
    setup({ autoDictate: true });

    expect(recognition().started).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Te escucho');
    expect(screen.getByRole('button', { name: 'Dictar movimiento' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
