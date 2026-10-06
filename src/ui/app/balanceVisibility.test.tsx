// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearPreferences, readHideBalances } from '../../data/preferences';
import { Money } from '../components/Money';
import { loadHideBalances, setHideBalances, useHideBalances } from './balanceVisibility';

// El ojo de Inicio: oculta el patrimonio y los saldos, y la elección se recuerda en el dispositivo
// para cada usuario, como el tema.

beforeEach(() => {
  window.localStorage.clear();
  act(() => {
    loadHideBalances('nadie');
  });
});

describe('ocultar saldos', () => {
  it('se guarda por usuario y se vuelve a cargar al abrir la app', () => {
    const { result } = renderHook(() => useHideBalances());
    expect(result.current).toBe(false);

    act(() => {
      setHideBalances('ana', true);
    });
    expect(result.current).toBe(true);
    expect(readHideBalances('ana')).toBe(true);
    // Otra persona en la misma compu no hereda la elección.
    expect(readHideBalances('beto')).toBe(false);

    act(() => {
      loadHideBalances('beto');
    });
    expect(result.current).toBe(false);
    act(() => {
      loadHideBalances('ana');
    });
    expect(result.current).toBe(true);
  });

  // "Borrar mi cuenta" no deja rastros en el dispositivo (ADR 0030).
  it('se borra con las demás preferencias', () => {
    setHideBalances('ana', true);
    clearPreferences('ana');
    expect(readHideBalances('ana')).toBe(false);
  });
});

describe('Money oculto', () => {
  it('muestra solo el símbolo de la moneda', () => {
    render(<Money cents={1_234_500} currency="USD" masked />);
    const amount = screen.getByLabelText('Monto oculto');
    expect(amount).toHaveTextContent('US$ •••••');
    expect(amount).not.toHaveTextContent('12.345');
  });
});
