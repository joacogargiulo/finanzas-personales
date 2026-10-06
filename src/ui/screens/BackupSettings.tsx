// Ajustes → Respaldo y exportación (SRS 6.6.5 y 8, ADR 0024 y 0025). Todo sale de los datos que
// ya están en el dispositivo: exportar no cuesta lecturas de Firestore. El JSON y el CSV
// funcionan sin conexión; Google Sheets necesita conexión y un permiso aparte de Google.

import { useEffect, useState } from 'react';
import { buildBackup, exportFileName } from '../../domain/backup';
import { today } from '../../domain/dates';
import {
  accountsTable,
  categoriesTable,
  transactionsTable,
  type Table,
} from '../../domain/exportTables';
import type { EpochMs } from '../../domain/model';
import { downloadFile } from '../../data/download';
import { csvZipBlob, jsonBlob } from '../../data/exportFiles';
import {
  forgetSheetsToken,
  GoogleError,
  googleClientId,
  loadGoogleIdentity,
  requestSheetsToken,
  type GoogleErrorCode,
} from '../../data/googleToken';
import { USER_COLLECTIONS } from '../../data/paths';
import { exportToSheets } from '../../data/sheets';
import { useData, useOnline } from '../app/hooks';
import { Icon } from '../components/Icon';
import { exportedAtLabel } from '../format';
import { session, store } from '../session';

/** Los datos del momento del click. Se leen del store recién ahí: la tarjeta no los necesita antes. */
function currentData() {
  const { accounts, categories, transactions, budgets, recurring } = store.getState();
  return { accounts, categories, transactions, budgets, recurring };
}

/** Las tres tablas, iguales para el CSV y para Sheets (ADR 0024). */
function exportTables(): Table[] {
  const { accounts, categories, transactions } = currentData();
  return [
    accountsTable(accounts, transactions),
    categoriesTable(categories),
    transactionsTable(transactions, accounts, categories),
  ];
}

function downloadJson() {
  downloadFile(exportFileName(today(), 'json'), jsonBlob(buildBackup(currentData(), Date.now())));
}

function downloadCsv() {
  downloadFile(exportFileName(today(), 'zip'), csvZipBlob(exportTables()));
}

const SHEETS_ERRORS: Record<GoogleErrorCode, string> = {
  notReady: 'Google todavía no terminó de cargar. Esperá un momento y probá de nuevo.',
  popup: 'No se pudo abrir la ventana de Google, o se cerró. Probá de nuevo.',
  denied: 'Sin el permiso de Google no se puede crear la hoja.',
  auth: 'El permiso de Google venció. Probá de nuevo.',
  network: 'No hay conexión con Google. Revisá tu conexión y probá de nuevo.',
  google: 'Google no pudo completar la exportación. Probá de nuevo en un rato.',
};

type SheetsState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; at: EpochMs; url: string }
  | { status: 'error'; message: string };

export function BackupSettings() {
  const loaded = useData((s) => USER_COLLECTIONS.every((name) => s.loaded[name]));
  const upToDate = useData((s) => s.sync.upToDate);

  return (
    <section className="card" aria-labelledby="backup-title">
      <h2 id="backup-title" className="card-title">
        Respaldo y exportación
      </h2>

      {loaded && !upToDate && (
        <div className="notice" role="status">
          <Icon name="warning" />
          <p className="notice-body">
            Sin conexión: se exporta lo que hay en este dispositivo. Puede faltar lo último que
            cargaste en otro.
          </p>
        </div>
      )}

      <div className="export-option">
        <button type="button" className="btn" disabled={!loaded} onClick={downloadCsv}>
          Descargar planilla (CSV)
        </button>
        <p className="field-hint">
          Un ZIP con tus cuentas, categorías y movimientos, listo para abrir en Excel.
        </p>
      </div>

      {googleClientId() !== '' && <SheetsExport loaded={loaded} />}

      <div className="export-option">
        <button type="button" className="btn" disabled={!loaded} onClick={downloadJson}>
          Descargar respaldo (JSON)
        </button>
        <p className="field-hint">
          Una copia completa de tus datos. La app no lo vuelve a cargar: guardalo como copia de
          seguridad.
        </p>
      </div>
    </section>
  );
}

function SheetsExport({ loaded }: { loaded: boolean }) {
  const online = useOnline();
  const email = useData((s) => (s.session.status === 'signedIn' ? s.session.user.email : null));
  const savedId = useData((s) => s.profile?.sheetsSpreadsheetId ?? null);
  const [state, setState] = useState<SheetsState>({ status: 'idle' });

  // El script de Google se precarga: el popup tiene que abrirse en el mismo toque del botón,
  // sin esperar una descarga antes, o el navegador lo bloquea (ADR 0025).
  useEffect(() => {
    if (online) loadGoogleIdentity().catch(() => undefined);
  }, [online]);

  async function exportSheets() {
    setState({ status: 'busy' });
    try {
      // Primero el token, sin ningún `await` antes: así el popup cuenta como parte del toque.
      const token = await requestSheetsToken(email);
      const result = await exportToSheets(token, exportTables(), savedId);
      const { profile, writesBlocked } = store.getState();
      if (result.spreadsheetId !== savedId && profile && !writesBlocked) {
        session.writer()?.setSheetsSpreadsheetId(result.spreadsheetId);
      }
      setState({ status: 'done', at: Date.now(), url: result.url });
    } catch (error) {
      const code = error instanceof GoogleError ? error.code : 'google';
      if (code === 'auth') forgetSheetsToken();
      if (!(error instanceof GoogleError)) console.error('Error al exportar a Sheets', error);
      setState({ status: 'error', message: SHEETS_ERRORS[code] });
    }
  }

  const busy = state.status === 'busy';
  return (
    <div className="export-option">
      <button
        type="button"
        className="btn"
        disabled={!loaded || !online || busy}
        onClick={() => {
          void exportSheets();
        }}
      >
        {busy ? 'Exportando…' : 'Exportar a Google Sheets'}
      </button>
      <p className="field-hint">
        {online
          ? 'Google te va a pedir permiso para crear y editar esta hoja en tu Drive. La app no ve tus otros archivos.'
          : 'Necesita conexión.'}
      </p>
      {state.status === 'done' && (
        <p className="field-hint" role="status">
          Exportado el {exportedAtLabel(state.at)}.{' '}
          <a href={state.url} target="_blank" rel="noreferrer">
            Abrir la hoja
          </a>
        </p>
      )}
      {state.status === 'error' && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
