import { describe, expect, it } from 'vitest';
import { makeAccount, makeCategory } from '../testing/factories';
import { AI_LIMITS, aiInput, buildAiMessages, validateAiInput } from './aiPrompt';

// Lo que viaja a la IA (ADR 0031): solo lo necesario, y el Worker lo revisa antes de gastar cuota.

const accounts = [
  makeAccount({ id: 'cash', name: 'Efectivo', initialBalance: 999_999 }),
  makeAccount({ id: 'old', name: 'Banco Viejo', archivedAt: 1 }),
];
const categories = [
  makeCategory({ id: 'food', name: 'Comida', type: 'expense' }),
  makeCategory({ id: 'gone', name: 'Vieja', deletedAt: 1 }),
];
const ctx = { accounts, categories, today: '2026-10-03' };

describe('aiInput: lo que se manda', () => {
  // Privacidad: ni saldos ni fechas de creación, y nada archivado ni eliminado.
  it('solo cuentas y categorías activas, con lo mínimo', () => {
    expect(aiInput('  gasté 500 en comida ', ctx)).toEqual({
      phrase: 'gasté 500 en comida',
      today: '2026-10-03',
      accounts: [{ id: 'cash', name: 'Efectivo', currency: 'ARS' }],
      categories: [{ id: 'food', name: 'Comida', type: 'expense' }],
    });
  });

  it('corta las frases larguísimas', () => {
    expect(aiInput('a'.repeat(500), ctx).phrase).toHaveLength(AI_LIMITS.phrase);
  });
});

describe('validateAiInput: lo que acepta el Worker', () => {
  const valid = aiInput('gasté 500', ctx);

  it('acepta lo que arma la app', () => {
    expect(validateAiInput(valid)).toEqual(valid);
  });

  // Campos de más se descartan: al modelo llega solo lo esperado.
  it('descarta campos que no espera', () => {
    const extra = { ...valid, accounts: [{ ...valid.accounts[0], initialBalance: 5 }] };
    expect(validateAiInput(extra)?.accounts[0]).toEqual({
      id: 'cash',
      name: 'Efectivo',
      currency: 'ARS',
    });
  });

  it.each([
    ['sin frase', { ...valid, phrase: '' }],
    ['frase demasiado larga', { ...valid, phrase: 'a'.repeat(AI_LIMITS.phrase + 1) }],
    ['fecha inválida', { ...valid, today: '2026-13-01' }],
    ['moneda desconocida', { ...valid, accounts: [{ id: 'x', name: 'X', currency: 'BTC' }] }],
    [
      'tipo de categoría desconocido',
      { ...valid, categories: [{ id: 'x', name: 'X', type: 'otro' }] },
    ],
    [
      'demasiadas cuentas',
      { ...valid, accounts: Array(AI_LIMITS.accounts + 1).fill(valid.accounts[0]) },
    ],
    ['no es un objeto', 'hola'],
  ])('rechaza: %s', (_, body) => {
    expect(validateAiInput(body)).toBeNull();
  });
});

describe('buildAiMessages', () => {
  // Los datos van como JSON en el mensaje del usuario, separados de las instrucciones.
  it('manda la fecha con el día de la semana y la frase aparte', () => {
    const [system, user] = buildAiMessages(aiInput('gasté 500 el lunes', ctx));
    expect(system?.role).toBe('system');
    expect(user?.content).toContain('2026-10-03 (sábado)');
    expect(user?.content).toContain('"gasté 500 el lunes"');
    expect(user?.content).not.toContain('999999');
  });
});
