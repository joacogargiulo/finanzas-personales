import { describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import { consolidate, equivalentArs, STALE_RATES_MS, toArs } from './consolidation';
import type { Account, ExchangeRates } from './model';
import { formatAmount } from './money';
import { makeAccount, makeExpense } from './testing/factories';

const NOW = 1_800_000_000_000;
const rates: ExchangeRates = { USD_ARS: 1300, EUR_ARS: 1400, fetchedAt: NOW - 1000 };

function run(accounts: Account[], r: ExchangeRates | null = rates) {
  return consolidate(accounts, computeBalances(accounts, []), r, NOW);
}

describe('consolidate (SRS 5.7)', () => {
  // TC-09: $100.000 + US$ 100 con el blue a $1.300 → $ 230.000,00.
  it('TC-09: total estimado en pesos', () => {
    const result = run([
      makeAccount({ initialBalance: 100_000_00 }),
      makeAccount({ currency: 'USD', initialBalance: 100_00 }),
    ]);
    expect(result.byCurrency).toEqual({ ARS: 100_000_00, USD: 100_00, EUR: 0 });
    expect(formatAmount(result.totalArs, 'ARS')).toBe('$ 230.000,00');
    expect(result.missing).toEqual([]);
  });

  // TC-10: sin cotización, el total no incluye los dólares y avisa cuánto falta.
  it('TC-10: sin cotización avisa lo que no incluye', () => {
    const result = run(
      [
        makeAccount({ initialBalance: 100_000_00 }),
        makeAccount({ currency: 'USD', initialBalance: 100_00 }),
      ],
      null,
    );
    expect(result.totalArs).toBe(100_000_00);
    expect(result.missing).toEqual([{ currency: 'USD', amount: 100_00 }]);
  });

  // Una cotización inválida (0, negativa, NaN) cuenta como faltante (SRS 5.8).
  it('descarta cotizaciones inválidas', () => {
    const result = run([makeAccount({ currency: 'EUR', initialBalance: 10_00 })], {
      ...rates,
      EUR_ARS: Number.NaN,
    });
    expect(result.missing).toEqual([{ currency: 'EUR', amount: 10_00 }]);
  });

  // Solo suman las cuentas activas; las lápidas se ignoran.
  it('ignora cuentas archivadas y eliminadas', () => {
    const result = run([
      makeAccount({ initialBalance: 50_00 }),
      makeAccount({ initialBalance: 0, archivedAt: 1 }),
      makeAccount({ initialBalance: 99_00, deletedAt: 1 }),
    ]);
    expect(result.totalArs).toBe(50_00);
    expect(result.archivedWithBalance).toEqual([]);
  });

  // TC-25: una cuenta archivada que recibió un gasto offline queda con saldo ≠ 0: se avisa
  // y no se suma al total.
  it('TC-25: detecta una cuenta archivada con saldo', () => {
    const archived = makeAccount({ archivedAt: 1 });
    const balances = computeBalances(
      [archived],
      [makeExpense({ accountId: archived.id, categoryId: 'c', amount: 10_00 })],
    );
    const result = consolidate([archived], balances, rates, NOW);
    expect(result.archivedWithBalance).toEqual([archived]);
    expect(result.totalArs).toBe(0);
  });

  // Más de 24 horas desde la última consulta → "desactualizada".
  it('marca la cotización desactualizada', () => {
    const old = { ...rates, fetchedAt: NOW - STALE_RATES_MS - 1 };
    expect(run([], old).ratesStale).toBe(true);
    expect(run([]).ratesStale).toBe(false);
    expect(run([], null).ratesStale).toBe(false);
  });
});

describe('conversión a pesos', () => {
  // Cotizaciones con decimales: US$ 10,01 × 1345,5 = $ 13.468,455 → $ 13.468,46.
  it('toArs redondea al centavo con enteros', () => {
    expect(toArs(10_01, 1345.5)).toBe(13_468_46);
    expect(toArs(-10_01, 1345.5)).toBe(-13_468_46);
  });

  // Debajo de cada cuenta USD/EUR se muestra "≈ $ X"; para ARS no hace falta.
  it('equivalentArs', () => {
    expect(equivalentArs(100_00, 'USD', rates)).toBe(130_000_00);
    expect(equivalentArs(100_00, 'ARS', rates)).toBeNull();
    expect(equivalentArs(100_00, 'EUR', null)).toBeNull();
  });
});
