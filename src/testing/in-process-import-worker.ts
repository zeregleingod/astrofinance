import type { ImportApi } from '@workers/import/import-api';
import { createImportHandlers } from '@workers/import/import-handlers';
import { serveRpc } from '@workers/rpc/rpc-server';
import { utils, write } from 'xlsx';
import { inProcessWorker, type InProcessWorker } from './in-process-worker';
import { sabadellSheet } from './sabadell-sheet';

/** Solo para tests: el worker real de lectura de ficheros (SheetJS) en el mismo hilo. */
export function inProcessImportWorker(): InProcessWorker {
  return inProcessWorker((endpoint) => serveRpc<ImportApi>(endpoint, createImportHandlers()));
}

/** Un `.xls` en memoria con la forma del extracto del Banc Sabadell. */
export function sabadellFile(
  rows: readonly (readonly unknown[])[] = sabadellSheet(),
  name = 'enero.xls',
): File {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows.map((row) => [...row])), 'Hoja1');
  const bytes = write(book, { bookType: 'biff8', type: 'array' }) as ArrayBuffer;
  return new File([bytes], name, { type: 'application/vnd.ms-excel' });
}
