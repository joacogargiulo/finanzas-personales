import { describe, expect, it } from 'vitest';
import { implicitRate } from './exchange';

describe('implicitRate (SRS 5.4)', () => {
  // TC-05: salen $130.000 y entran US$ 100 → "1 USD = $ 1.300,00".
  it('TC-05: compra de dólares', () => {
    const rate = implicitRate(
      { currency: 'ARS', amount: 130_000_00 },
      { currency: 'USD', amount: 100_00 },
    );
    expect(rate).toEqual({
      base: 'USD',
      quote: 'ARS',
      rate: 1_300_00,
      label: '1 USD = $ 1.300,00',
    });
  });

  // En una venta la cotización se expresa igual: pesos por unidad de la otra moneda.
  it('venta de euros: también en pesos por euro', () => {
    const rate = implicitRate(
      { currency: 'EUR', amount: 50_00 },
      { currency: 'ARS', amount: 70_000_00 },
    );
    expect(rate?.label).toBe('1 EUR = $ 1.400,00');
  });

  // Entre USD y EUR se muestran euros por 1 dólar, venga de donde venga.
  it('USD ↔ EUR: euros por 1 USD', () => {
    const buyEur = implicitRate(
      { currency: 'USD', amount: 100_00 },
      { currency: 'EUR', amount: 92_00 },
    );
    const buyUsd = implicitRate(
      { currency: 'EUR', amount: 92_00 },
      { currency: 'USD', amount: 100_00 },
    );
    expect(buyEur?.label).toBe('1 USD = € 0,92');
    expect(buyUsd?.label).toBe('1 USD = € 0,92');
  });

  // El resultado se redondea al centavo: $1.000 por US$ 3 = $333,333… → $ 333,33.
  it('redondea al centavo', () => {
    const rate = implicitRate(
      { currency: 'ARS', amount: 1_000_00 },
      { currency: 'USD', amount: 3_00 },
    );
    expect(rate?.rate).toBe(333_33);
  });

  // Mientras el usuario escribe, puede faltar un monto: no hay cotización todavía.
  it('devuelve null con montos vacíos o la misma moneda', () => {
    expect(
      implicitRate({ currency: 'ARS', amount: 0 }, { currency: 'USD', amount: 100 }),
    ).toBeNull();
    expect(
      implicitRate({ currency: 'ARS', amount: 100 }, { currency: 'ARS', amount: 100 }),
    ).toBeNull();
  });
});
