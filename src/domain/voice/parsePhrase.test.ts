import { describe, expect, it } from 'vitest';
import type { Category } from '../model';
import { SEED_CATEGORIES } from '../seed';
import { makeAccount, makeCategory } from '../testing/factories';
import { parsePhrase, type ParsedPhrase } from './parsePhrase';

// Escenario: las categorías iniciales más una propia y una archivada, y cuatro cuentas.
// Hoy es sábado 3 de octubre de 2026.
const TODAY = '2026-10-03';
const seeds: Category[] = SEED_CATEGORIES.map((c) => makeCategory({ ...c }));
const farmacia = makeCategory({ id: 'farmacia', name: 'Farmacia' });
const gimnasio = makeCategory({ id: 'gimnasio', name: 'Gimnasio', archivedAt: 1 });
const categories = [...seeds, farmacia, gimnasio];
const accounts = [
  makeAccount({ id: 'cash', name: 'Efectivo' }),
  makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet' }),
  makeAccount({ id: 'card', name: 'Tarjeta de Crédito', kind: 'bank' }),
  makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' }),
  makeAccount({ id: 'old', name: 'Banco Viejo', archivedAt: 1 }),
];

const parse = (text: string) => parsePhrase(text, { accounts, categories, today: TODAY });

describe('parsePhrase: frases completas', () => {
  // Cada fila: lo que se dicta y los campos que tiene que entender.
  it.each<[string, Partial<ParsedPhrase>]>([
    [
      'gasté dieciocho mil en el súper con efectivo ayer',
      {
        type: 'expense',
        amount: 18_000_00,
        categoryId: 'seed_comida',
        accountId: 'cash',
        date: '2026-10-02',
        description: 'Súper',
        missing: [],
      },
    ],
    [
      'pagué 2.500 de luz con mercado pago',
      {
        type: 'expense',
        amount: 2_500_00,
        categoryId: 'seed_servicios',
        accountId: 'mp',
        description: 'Luz',
      },
    ],
    [
      'Nafta 20 mil con la tarjeta de crédito',
      {
        type: 'expense',
        amount: 20_000_00,
        categoryId: 'seed_transporte',
        accountId: 'card',
        description: 'Nafta',
      },
    ],
    [
      'almuerzo 12.500 efectivo el lunes',
      {
        type: 'expense',
        amount: 12_500_00,
        categoryId: 'seed_comida',
        accountId: 'cash',
        date: '2026-09-28',
      },
    ],
    [
      'gasté mil con cincuenta en el kiosco',
      { type: 'expense', amount: 1_000_50, categoryId: 'seed_comida', description: 'Kiosco' },
    ],
    [
      'farmacia 4300 con mercadopago',
      {
        type: 'expense',
        amount: 4_300_00,
        categoryId: 'farmacia',
        accountId: 'mp',
        description: '',
      },
    ],
    [
      'uber 3200 ayer',
      { type: 'expense', amount: 3_200_00, categoryId: 'seed_transporte', date: '2026-10-02' },
    ],
    [
      'el 5 de octubre pagué internet 9.999,99',
      { type: 'expense', amount: 9_999_99, categoryId: 'seed_servicios', date: '2025-10-05' },
    ],
    [
      'pagué 300 en efectivo el viernes pasado',
      { type: 'expense', amount: 300_00, accountId: 'cash', date: '2026-10-02' },
    ],
    [
      'gasté un palo y medio en la tele',
      { type: 'expense', amount: 1_500_000_00, description: 'Tele' },
    ],
    [
      'me cobraron 1500 de comisión en la tarjeta',
      {
        type: 'expense',
        amount: 1_500_00,
        accountId: 'card',
        description: 'Comisión',
        categoryId: null,
      },
    ],
  ])('gasto: "%s"', (text, expected) => {
    expect(parse(text)).toMatchObject(expected);
  });

  it.each<[string, Partial<ParsedPhrase>]>([
    [
      'cobré el sueldo, 850 mil',
      {
        type: 'income',
        amount: 850_000_00,
        categoryId: 'seed_salario',
        accountId: null,
        description: 'Sueldo',
      },
    ],
    [
      'me pagaron 300 lucas en mercado pago',
      { type: 'income', amount: 300_000_00, accountId: 'mp', categoryId: null },
    ],
    [
      'recibí $ 45.000 de regalo',
      {
        type: 'income',
        amount: 45_000_00,
        currency: 'ARS',
        categoryId: 'seed_otros_ingresos',
        description: 'Regalo',
      },
    ],
  ])('ingreso: "%s"', (text, expected) => {
    expect(parse(text)).toMatchObject(expected);
  });

  it.each<[string, Partial<ParsedPhrase>]>([
    [
      'transferí 10 mil de efectivo a mercado pago',
      {
        type: 'transfer',
        amount: 10_000_00,
        accountId: 'cash',
        toAccountId: 'mp',
        categoryId: null,
        missing: [],
      },
    ],
    [
      'pasé 1000 de la tarjeta de crédito al efectivo',
      { type: 'transfer', accountId: 'card', toAccountId: 'cash' },
    ],
    // "a" antes del nombre indica el destino, aunque no se diga el origen.
    [
      'pasé 5000 a la tarjeta',
      { type: 'transfer', accountId: null, toAccountId: 'card', missing: ['account'] },
    ],
  ])('transferencia: "%s"', (text, expected) => {
    expect(parse(text)).toMatchObject(expected);
  });
});

describe('parsePhrase: moneda y cuenta implícita', () => {
  // Con "dólares" y una sola cuenta en dólares, se elige esa cuenta.
  it('usa la única cuenta de la moneda nombrada', () => {
    expect(parse('gasté 50 dólares en el cine')).toMatchObject({
      type: 'expense',
      amount: 50_00,
      currency: 'USD',
      accountId: 'usd',
      categoryId: 'seed_ocio',
    });
  });

  // Sin cuenta de esa moneda, la cuenta queda vacía.
  it('no inventa una cuenta que no existe', () => {
    expect(parse('ingresé 2000 euros')).toMatchObject({
      type: 'income',
      currency: 'EUR',
      accountId: null,
    });
  });

  // Si el usuario tiene una sola cuenta activa, se usa esa.
  it('usa la única cuenta activa', () => {
    const result = parsePhrase('gasté 500 en comida', {
      accounts: [makeAccount({ id: 'only' })],
      categories,
      today: TODAY,
    });
    expect(result).toMatchObject({ accountId: 'only', categoryId: 'seed_comida', description: '' });
  });

  // Las cuentas archivadas no se ofrecen.
  it('ignora cuentas archivadas', () => {
    expect(parse('gasté 500 con banco viejo').accountId).toBeNull();
  });
});

describe('parsePhrase: categorías', () => {
  // Sin verbo, el tipo sale de la categoría.
  it('deduce el tipo por la categoría', () => {
    expect(parse('súper 5000 con efectivo').type).toBe('expense');
    expect(parse('aguinaldo 400 mil').type).toBe('income');
  });

  // Los sinónimos siguen a la categoría inicial aunque se haya renombrado.
  it('respeta una categoría inicial renombrada', () => {
    const renamed = categories.map((c) =>
      c.id === 'seed_comida' ? { ...c, name: 'Alimentos' } : c,
    );
    const result = parsePhrase('súper 1000', { accounts, categories: renamed, today: TODAY });
    expect(result.categoryId).toBe('seed_comida');
  });

  // Una categoría archivada no se elige.
  it('ignora categorías archivadas', () => {
    expect(parse('gimnasio 15000')).toMatchObject({ categoryId: null, type: null });
  });

  // Un sinónimo de gasto no se usa en un ingreso.
  it('la categoría tiene que ser del tipo del movimiento', () => {
    expect(parse('cobré 5000 de cena').categoryId).toBeNull();
  });

  // Dos categorías en la frase: no adivina. El campo queda dudoso y lo elige el usuario (#22).
  it('con dos categorías por nombre no elige ninguna', () => {
    const nala = makeCategory({ id: 'nala', name: 'Nala' });
    const result = parsePhrase('comida para la nala gasté 85000 con efectivo', {
      accounts,
      categories: [...categories, nala],
      today: TODAY,
    });
    expect(result).toMatchObject({
      type: 'expense',
      amount: 85_000_00,
      accountId: 'cash',
      categoryId: null,
      description: 'Comida para la nala',
    });
    expect(result.missing).toEqual(['category']);
  });

  it('con un nombre y un sinónimo de otra categoría tampoco elige', () => {
    expect(parse('farmacia y súper 3000')).toMatchObject({ categoryId: null, type: 'expense' });
  });

  // Dos sinónimos de la misma categoría no son una duda.
  it('dos palabras de la misma categoría la eligen igual', () => {
    expect(parse('cena en el súper 3000').categoryId).toBe('seed_comida');
  });

  // Si las candidatas son de tipos distintos, tampoco se adivina el tipo.
  it('con categorías de tipos distintos deja el tipo vacío', () => {
    expect(parse('súper aguinaldo 3000')).toMatchObject({ categoryId: null, type: null });
  });
});

describe('parsePhrase: lo que no entiende', () => {
  // ADR 0015: los cambios de moneda quedan afuera y el tipo queda vacío.
  it.each(['compré 100 dólares', 'cambié 200 dólares', 'vendí 50 euros'])(
    '"%s" se marca como cambio de moneda',
    (text) => {
      expect(parse(text)).toMatchObject({ unsupported: 'exchange', type: null });
    },
  );

  // Comprar algo pagando en dólares sí es un gasto.
  it('comprar algo en dólares es un gasto', () => {
    expect(parse('compré zapatillas por 80 dólares')).toMatchObject({
      type: 'expense',
      unsupported: null,
      description: 'Zapatillas',
    });
  });

  // Con varios números, el más grande es el monto; el resto queda en la descripción.
  it('el monto es el número más grande', () => {
    expect(parse('gasté 2 cafés 3000 efectivo')).toMatchObject({
      amount: 3_000_00,
      description: '2 cafés',
    });
  });

  // Lo que falta queda en `missing` para que el formulario lo pida.
  it('reporta los campos faltantes', () => {
    expect(parse('pagué el alquiler el 5')).toMatchObject({
      type: 'expense',
      amount: null,
      date: '2026-09-05',
      description: 'Alquiler',
      missing: ['amount', 'account', 'category'],
    });
    expect(parse('hola qué tal')).toMatchObject({
      type: null,
      amount: null,
      date: TODAY,
      missing: ['type', 'amount', 'account', 'category'],
    });
  });

  it('una frase vacía no rompe nada', () => {
    expect(parse('').description).toBe('');
  });
});

// Lo que escribió el dictado de Chrome en un Android (2026-10-06): miles con coma.
it('"gasté $38,700 en comida para nala" es un gasto de $ 38.700', () => {
  expect(parse('gasté $38,700 en comida para nala')).toMatchObject({
    type: 'expense',
    amount: 3_870_000,
  });
});

// El dictado de Chrome escribe los miles con un espacio ("$50 000"): son un solo número.
describe('parsePhrase: miles separados por espacios', () => {
  it('"pagué $50 000 de gas con mercado pago" es un gasto de $ 50.000', () => {
    expect(parse('pagué $50 000 de gas con mercado pago')).toMatchObject({
      type: 'expense',
      amount: 50_000_00,
      currency: 'ARS',
      accountId: 'mp',
      categoryId: 'seed_servicios',
      description: 'Gas',
      missing: [],
    });
  });

  it('junta varios grupos y acepta el espacio angosto (U+202F) y los centavos', () => {
    expect(parse('cobré 1 500 000 con efectivo').amount).toBe(1_500_000_00);
    expect(parse('gasté 12\u202f000 en el súper').amount).toBe(12_000_00);
    expect(parse('gasté 2 500,50 en el súper').amount).toBe(2_500_50);
  });

  it('no junta números que no son grupos de miles', () => {
    // "3000" tiene 4 cifras: no es un grupo; el monto es el número más grande.
    expect(parse('gasté 2 3000 en cafés').amount).toBe(3_000_00);
  });
});
