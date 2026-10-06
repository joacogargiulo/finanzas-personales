// Exportar a Google Sheets (SRS 8.4, ADR 0025) con la API REST de Sheets y un token de
// `googleToken.ts`. A diferencia de Firestore, acá sí se esperan las respuestas: es una
// operación con conexión que se completa o falla, y la pantalla muestra el resultado.

import type { Table } from '../domain/exportTables';
import { sheetRequests, type SheetGrid, type SheetsRequest } from '../domain/sheetsValues';
import { GoogleError } from './googleToken';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
export const SPREADSHEET_TITLE = 'Control de Finanzas — Exportación';

export interface SheetsExport {
  spreadsheetId: string;
  url: string;
}

interface SheetProperties {
  sheetId: number;
  title: string;
  gridProperties?: { rowCount?: number };
}

interface Spreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets?: { properties: SheetProperties }[];
}

type Fetch = typeof fetch;

/**
 * Exporta las tablas a la hoja guardada en el perfil (`savedId`) o, si no hay, si se borró o
 * está en la papelera, a una hoja nueva. Devuelve la hoja usada: si el ID cambió, quien llama lo
 * guarda en el perfil.
 */
export async function exportToSheets(
  token: string,
  tables: readonly Table[],
  savedId: string | null,
  fetchFn: Fetch = fetch,
): Promise<SheetsExport> {
  async function call<T>(url: string, init: RequestInit = {}): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchFn(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    } catch {
      throw new GoogleError('network');
    }
    if (response.status === 401) throw new GoogleError('auth');
    // 404: no existe. 403: no es una hoja que haya creado la app (drive.file no la ve).
    if (response.status === 404 || response.status === 403) return null;
    if (!response.ok) throw new GoogleError('google', `${String(response.status)} ${url}`);
    return (await response.json()) as T;
  }

  async function batchUpdate(id: string, requests: SheetsRequest[]) {
    const result = await call<{ replies?: { addSheet?: { properties: SheetProperties } }[] }>(
      `${SHEETS_API}/${id}:batchUpdate`,
      { method: 'POST', body: JSON.stringify({ requests }) },
    );
    if (!result) throw new GoogleError('google', 'la hoja desapareció mientras se exportaba');
    return result;
  }

  async function openSaved(id: string): Promise<Spreadsheet | null> {
    // La API de Sheets abre igual una hoja que está en la papelera: eso lo dice Drive.
    const file = await call<{ trashed?: boolean }>(
      `${DRIVE_API}/${encodeURIComponent(id)}?fields=trashed`,
    );
    if (!file || file.trashed === true) return null;
    return call<Spreadsheet>(
      `${SHEETS_API}/${encodeURIComponent(id)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties`,
    );
  }

  async function create(): Promise<Spreadsheet> {
    const created = await call<Spreadsheet>(SHEETS_API, {
      method: 'POST',
      body: JSON.stringify({
        // es_AR: muestra los números como 1.234,56 y las fechas como 04/10/2026.
        properties: { title: SPREADSHEET_TITLE, locale: 'es_AR' },
        sheets: tables.map((table) => ({ properties: { title: table.title } })),
      }),
    });
    if (!created) throw new GoogleError('google', 'no se pudo crear la hoja');
    return created;
  }

  const spreadsheet = (savedId ? await openSaved(savedId) : null) ?? (await create());
  const id = spreadsheet.spreadsheetId;
  const sheets = (spreadsheet.sheets ?? []).map((sheet) => sheet.properties);

  // Si el usuario borró alguna pestaña, se vuelve a crear.
  const missing = tables.filter((table) => !sheets.some((sheet) => sheet.title === table.title));
  if (missing.length > 0) {
    const { replies = [] } = await batchUpdate(
      id,
      missing.map((table) => ({ addSheet: { properties: { title: table.title } } })),
    );
    for (const reply of replies) if (reply.addSheet) sheets.push(reply.addSheet.properties);
  }

  // Todos los datos en un solo batchUpdate: Google lo aplica entero o no aplica nada.
  const requests = tables.flatMap((table) => {
    const sheet = sheets.find((s) => s.title === table.title);
    if (!sheet) throw new GoogleError('google', `falta la pestaña ${table.title}`);
    const grid: SheetGrid = {
      sheetId: sheet.sheetId,
      rowCount: sheet.gridProperties?.rowCount ?? 0,
    };
    return sheetRequests(table, grid);
  });
  await batchUpdate(id, requests);

  return { spreadsheetId: id, url: spreadsheet.spreadsheetUrl };
}
