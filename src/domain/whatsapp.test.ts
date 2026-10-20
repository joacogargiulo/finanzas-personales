import { describe, expect, it } from 'vitest';
import { makeAccount, makeCategory } from './testing/factories';
import {
  BOT_REPLIES,
  formatLinkCode,
  invalidReply,
  missingReply,
  parseConfirmation,
  transactionSummary,
  whatsappTransactionDoc,
  isLinkCode,
  isWhatsAppNumber,
  linkMessageUrl,
  maskPhone,
  parseLinkCommand,
} from './whatsapp';

// El mensaje que manda la persona para vincular su número (ADR 0033): se escribe a mano, así
// que se aceptan las variantes razonables y se rechaza todo lo demás.
describe('parseLinkCommand', () => {
  it.each([
    ['vincular 123456', '123456'],
    ['Vincular 123456', '123456'],
    ['VINCULAR   123456  ', '123456'],
    ['vincular: 123456', '123456'],
    ['vincular 123 456', '123456'],
    ['vincular 012345.', '012345'],
    ['vinculár 123456', '123456'],
  ])('"%s" → %s', (text, code) => {
    expect(parseLinkCommand(text)).toBe(code);
  });

  it.each([
    'vincular',
    'vincular 12345',
    'vincular 1234567',
    'vincular abcdef',
    '123456',
    'gasté 123456 en el súper',
    'por favor vincular 123456',
  ])('"%s" no es un pedido de vinculación', (text) => {
    expect(parseLinkCommand(text)).toBeNull();
  });
});

// El código siempre tiene 6 cifras, aunque el número sorteado sea chico.
describe('códigos', () => {
  it('completa con ceros adelante', () => {
    expect(formatLinkCode(42)).toBe('000042');
    expect(formatLinkCode(999_999)).toBe('999999');
  });

  it('rechaza números fuera de rango', () => {
    expect(() => formatLinkCode(1_000_000)).toThrow(RangeError);
    expect(() => formatLinkCode(-1)).toThrow(RangeError);
    expect(() => formatLinkCode(1.5)).toThrow(RangeError);
  });

  it('reconoce un código válido', () => {
    expect(isLinkCode('000042')).toBe(true);
    expect(isLinkCode('42')).toBe(false);
    expect(isLinkCode('12345a')).toBe(false);
  });
});

// Cómo se ve y se usa el número.
describe('números', () => {
  it('reconoce el formato de WhatsApp: solo cifras, con código de país', () => {
    expect(isWhatsAppNumber('5491123456789')).toBe(true);
    expect(isWhatsAppNumber('+5491123456789')).toBe(false);
    expect(isWhatsAppNumber('1234')).toBe(false);
  });

  it('oculta el medio del número', () => {
    expect(maskPhone('5491123456789')).toBe('+54 ••• 6789');
  });

  it('arma el enlace a WhatsApp con el mensaje ya escrito', () => {
    expect(linkMessageUrl('+1 555 010 0000', '123456')).toBe(
      'https://wa.me/15550100000?text=vincular%20123456',
    );
  });
});

// ── Confirmación y resumen del movimiento (ADR 0034) ──────────────────────────

describe('parseConfirmation', () => {
  it.each(['sí', 'Si', 'DALE', 'ok', 'guardar', 'Sí.', 'dale!'])('%s → guardar', (text) => {
    expect(parseConfirmation(text)).toBe('save');
  });

  it.each(['no', 'No.', 'cancelar', 'NOP'])('%s → cancelar', (text) => {
    expect(parseConfirmation(text)).toBe('cancel');
  });

  it('otra cosa no es una confirmación (puede ser un movimiento nuevo)', () => {
    expect(parseConfirmation('gasté 500 en el súper')).toBeNull();
    expect(parseConfirmation('')).toBeNull();
  });
});

describe('transactionSummary', () => {
  const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
  const usd = makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' });
  const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
  const ctx = {
    accounts: new Map([cash, usd].map((a) => [a.id, a])),
    categories: new Map([[food.id, food]]),
  };
  const TODAY = '2026-10-03';

  it('un gasto de hoy muestra monto, cuenta, categoría y fecha', () => {
    const text = transactionSummary(
      {
        type: 'expense',
        amount: 1_800_000,
        date: TODAY,
        description: 'Súper',
        accountId: 'cash',
        categoryId: 'food',
      },
      ctx,
      TODAY,
    );
    expect(text).toBe(
      [
        'Gasto de $ 18.000,00',
        'Cuenta (desde): Efectivo',
        'Categoría: Comida',
        'Fecha: hoy (03/10/2026)',
        'Descripción: Súper',
      ].join('\n'),
    );
  });

  it('dice "ayer" y omite la descripción vacía', () => {
    const text = transactionSummary(
      {
        type: 'expense',
        amount: 500,
        date: '2026-10-02',
        description: '',
        accountId: 'cash',
        categoryId: 'food',
      },
      ctx,
      TODAY,
    );
    expect(text).toContain('Fecha: ayer (02/10/2026)');
    expect(text).not.toContain('Descripción');
  });

  it('un cambio muestra las dos monedas', () => {
    const text = transactionSummary(
      {
        type: 'exchange',
        amount: 10_000_000,
        toAmount: 10_000,
        date: '2026-09-20',
        description: '',
        accountId: 'cash',
        toAccountId: 'usd',
      },
      ctx,
      TODAY,
    );
    expect(text).toContain('Sale: $ 100.000,00 de Efectivo');
    expect(text).toContain('Entra: US$ 100,00 en Caja USD');
    expect(text).toContain('Fecha: 20/09/2026');
  });
});

describe('respuestas de faltantes y errores', () => {
  it('nombra lo que falta', () => {
    expect(missingReply(['account'])).toContain('la cuenta');
    expect(missingReply(['amount', 'category'])).toContain('el monto y la categoría');
  });

  it('si falta casi todo, muestra un ejemplo', () => {
    expect(missingReply(['type', 'amount', 'account', 'category'])).toBe(BOT_REPLIES.example);
  });

  it('invalidReply lista cada error con el texto del dominio', () => {
    const text = invalidReply({
      amount: { code: 'amount.notPositive' },
      accountId: { code: 'account.missing' },
    });
    expect(text).toContain('• El monto tiene que ser mayor a cero.');
    expect(text).toContain('• La cuenta no existe.');
  });
});

describe('whatsappTransactionDoc', () => {
  it('agrega el origen, createdAt y deletedAt, y no trae updatedAt', () => {
    const doc = whatsappTransactionDoc(
      {
        type: 'income',
        amount: 100,
        date: '2026-10-03',
        description: '',
        accountId: 'cash',
        categoryId: 'sueldo',
      },
      1_700_000_000_000,
    );
    expect(doc).toMatchObject({
      source: 'whatsapp',
      createdAt: 1_700_000_000_000,
      deletedAt: null,
    });
    expect(doc).not.toHaveProperty('updatedAt');
  });
});
