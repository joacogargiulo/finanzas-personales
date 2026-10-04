// Ajustes → Respaldo y exportación (SRS 6.6.5 y 8, ADR 0024). Todo sale de los datos que ya
// están en el dispositivo: exportar no cuesta lecturas de Firestore y funciona sin conexión.

import { buildBackup, exportFileName } from '../../domain/backup';
import { today } from '../../domain/dates';
import { accountsTable, categoriesTable, transactionsTable } from '../../domain/exportTables';
import { downloadFile } from '../../data/download';
import { csvZipBlob, jsonBlob } from '../../data/exportFiles';
import { USER_COLLECTIONS } from '../../data/paths';
import { useData } from '../app/hooks';
import { Icon } from '../components/Icon';
import { store } from '../session';

/** Los datos del momento del click. Se leen del store recién ahí: la tarjeta no los necesita antes. */
function currentData() {
  const { accounts, categories, transactions, budgets, recurring } = store.getState();
  return { accounts, categories, transactions, budgets, recurring };
}

function downloadJson() {
  downloadFile(exportFileName(today(), 'json'), jsonBlob(buildBackup(currentData(), Date.now())));
}

function downloadCsv() {
  const { accounts, categories, transactions } = currentData();
  const tables = [
    accountsTable(accounts, transactions),
    categoriesTable(categories),
    transactionsTable(transactions, accounts, categories),
  ];
  downloadFile(exportFileName(today(), 'zip'), csvZipBlob(tables));
}

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
