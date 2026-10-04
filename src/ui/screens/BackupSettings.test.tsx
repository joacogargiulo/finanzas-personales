// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { today } from '../../domain/dates';
import { makeAccount, makeCategory, makeExpense } from '../../domain/testing/factories';
import { downloadFile } from '../../data/download';
import { emptyState } from '../../data/store';
import { store } from '../session';
import { BackupSettings } from './BackupSettings';

// Un store de prueba en lugar de la sesión real, y una descarga falsa que solo registra la llamada.
vi.mock('../session', async () => {
  const { createDataStore } = await import('../../data/store');
  return { store: createDataStore(), session: { writer: () => null } };
});
vi.mock('../../data/download', () => ({ downloadFile: vi.fn() }));

const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
const food = makeCategory({ id: 'food', name: 'Comida' });
const allLoaded = {
  accounts: true,
  categories: true,
  transactions: true,
  budgets: true,
  recurring: true,
};

function setData(overrides: Partial<ReturnType<typeof store.getState>> = {}) {
  act(() => {
    store.setState({
      ...emptyState({ status: 'loading' }),
      accounts: [cash],
      categories: [food],
      transactions: [makeExpense({ accountId: 'cash', categoryId: 'food', description: 'Súper' })],
      loaded: allLoaded,
      sync: { pendingWrites: false, upToDate: true },
      ...overrides,
    });
  });
}

/** Lo que recibió la descarga falsa en la última llamada. */
function lastDownload(): { name: string; blob: Blob } {
  const [name, blob] = vi.mocked(downloadFile).mock.lastCall ?? [];
  if (!name || !blob) throw new Error('No hubo descarga');
  return { name, blob };
}

beforeEach(() => {
  vi.mocked(downloadFile).mockClear();
});

// Mientras la caché no entregó todas las colecciones, exportar daría un archivo incompleto.
describe('antes de cargar', () => {
  it('los botones están deshabilitados', () => {
    setData({ loaded: { ...allLoaded, transactions: false } });
    render(<BackupSettings />);
    expect(screen.getByRole('button', { name: 'Descargar planilla (CSV)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descargar respaldo (JSON)' })).toBeDisabled();
  });
});

// Exportar funciona sin conexión, pero avisa que pueden faltar datos de otros dispositivos.
describe('aviso sin conexión', () => {
  it('aparece si el dispositivo no está al día con el servidor', () => {
    setData({ sync: { pendingWrites: false, upToDate: false } });
    render(<BackupSettings />);
    expect(screen.getByRole('status')).toHaveTextContent(/Sin conexión/);
  });

  it('no aparece si está al día', () => {
    setData();
    render(<BackupSettings />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

// Cada botón arma su archivo con los datos del store y lo descarga con el nombre del día.
describe('descargas', () => {
  it('el respaldo JSON lleva el nombre del día y los datos', async () => {
    setData();
    render(<BackupSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar respaldo (JSON)' }));

    const { name, blob } = lastDownload();
    expect(name).toBe(`finanzas_${today()}.json`);
    const backup = JSON.parse(await blob.text()) as { format: string; accounts: unknown[] };
    expect(backup.format).toBe('control-finanzas');
    expect(backup.accounts).toEqual([cash]);
  });

  it('la planilla es un ZIP con los tres CSV', async () => {
    setData();
    render(<BackupSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Descargar planilla (CSV)' }));

    const { name, blob } = lastDownload();
    expect(name).toBe(`finanzas_${today()}.zip`);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['categorias.csv', 'cuentas.csv', 'movimientos.csv']);
    const movements = new TextDecoder().decode(files['movimientos.csv']);
    expect(movements).toContain('Súper');
  });
});
