// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { today } from '../../domain/dates';
import { makeAccount, makeCategory, makeExpense } from '../../domain/testing/factories';
import { downloadFile } from '../../data/download';
import { GoogleError, googleClientId, requestSheetsToken } from '../../data/googleToken';
import { exportToSheets } from '../../data/sheets';
import { emptyState } from '../../data/store';
import { store } from '../session';
import { BackupSettings } from './BackupSettings';

// Un store de prueba en lugar de la sesión real, una descarga falsa que solo registra la llamada
// y un Google falso: el token y la exportación a Sheets responden lo que decide cada test.
const setSheetsSpreadsheetId = vi.fn();
vi.mock('../session', async () => {
  const { createDataStore } = await import('../../data/store');
  return { store: createDataStore(), session: { writer: () => ({ setSheetsSpreadsheetId }) } };
});
vi.mock('../../data/download', () => ({ downloadFile: vi.fn() }));
vi.mock('../../data/googleToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/googleToken')>()),
  googleClientId: vi.fn(() => 'client-id'),
  loadGoogleIdentity: vi.fn(() => Promise.resolve()),
  requestSheetsToken: vi.fn(() => Promise.resolve('token')),
}));
vi.mock('../../data/sheets', () => ({ exportToSheets: vi.fn() }));

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
  vi.clearAllMocks();
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

// Sheets (ADR 0025): necesita el Client ID, conexión y el permiso de Google.
describe('exportar a Google Sheets', () => {
  const button = () => screen.getByRole('button', { name: 'Exportar a Google Sheets' });
  const profile = {
    schemaVersion: 1,
    seededAt: 1,
    sheetsSpreadsheetId: null,
    createdAt: 1,
    updatedAt: 1,
  };

  it('sin Client ID no se ofrece', () => {
    vi.mocked(googleClientId).mockReturnValueOnce('');
    setData();
    render(<BackupSettings />);
    expect(screen.queryByRole('button', { name: /Sheets/ })).not.toBeInTheDocument();
  });

  it('sin conexión está deshabilitado', () => {
    const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    setData();
    render(<BackupSettings />);
    expect(button()).toBeDisabled();
    expect(screen.getByText('Necesita conexión.')).toBeInTheDocument();
    offline.mockRestore();
  });

  // La primera exportación crea la hoja: la pantalla muestra el enlace y guarda su ID.
  it('muestra cuándo se exportó, el enlace y guarda el ID de la hoja', async () => {
    vi.mocked(exportToSheets).mockResolvedValue({ spreadsheetId: 'hoja1', url: 'https://hoja' });
    setData({ profile });
    render(<BackupSettings />);
    await userEvent.click(button());

    expect(await screen.findByRole('link', { name: 'Abrir la hoja' })).toHaveAttribute(
      'href',
      'https://hoja',
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^Exportado el /);
    expect(vi.mocked(exportToSheets).mock.lastCall?.[2]).toBeNull();
    expect(setSheetsSpreadsheetId).toHaveBeenCalledWith('hoja1');
  });

  it('si la hoja es la misma, no vuelve a guardar el ID', async () => {
    vi.mocked(exportToSheets).mockResolvedValue({ spreadsheetId: 'hoja1', url: 'https://hoja' });
    setData({ profile: { ...profile, sheetsSpreadsheetId: 'hoja1' } });
    render(<BackupSettings />);
    await userEvent.click(button());

    await screen.findByRole('link', { name: 'Abrir la hoja' });
    expect(vi.mocked(exportToSheets).mock.lastCall?.[2]).toBe('hoja1');
    expect(setSheetsSpreadsheetId).not.toHaveBeenCalled();
  });

  it('si la persona no da el permiso, lo explica', async () => {
    vi.mocked(requestSheetsToken).mockRejectedValueOnce(new GoogleError('denied'));
    setData({ profile });
    render(<BackupSettings />);
    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sin el permiso de Google no se puede crear la hoja.',
    );
    expect(exportToSheets).not.toHaveBeenCalled();
  });
});
