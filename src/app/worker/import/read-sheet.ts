import {
  MAX_STATEMENT_BYTES,
  MAX_STATEMENT_ROWS,
  StatementError,
  type RawCell,
  type RawSheet,
} from '@domain/imports/bank-statement';
import { read, utils, type WorkBook } from 'xlsx';

const XLS_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/**
 * Lee la primera hoja de un fichero bancario (T6.1). El fichero es entrada no confiable: se
 * limita el tamaño, el tipo se decide por el contenido y no por la extensión, y solo salen de
 * aquí textos y números (las fórmulas no se leen ni se evalúan).
 */
export function readSheet(bytes: Uint8Array): RawSheet {
  if (bytes.length === 0) throw new StatementError('fichero-vacio');
  if (bytes.length > MAX_STATEMENT_BYTES) throw new StatementError('fichero-demasiado-grande');

  let workbook: WorkBook;
  try {
    workbook = isSpreadsheet(bytes)
      ? read(bytes, { type: 'array', cellFormula: false, sheetRows: MAX_STATEMENT_ROWS + 1 })
      : // `raw` deja el CSV como texto: los importes y fechas es-ES los interpreta el dominio.
        read(decodeText(bytes), { type: 'string', raw: true, sheetRows: MAX_STATEMENT_ROWS + 1 });
  } catch (error) {
    if (error instanceof StatementError) throw error;
    throw new StatementError('fichero-ilegible');
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) throw new StatementError('fichero-vacio');
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  if (rows.length > MAX_STATEMENT_ROWS) throw new StatementError('fichero-demasiado-grande');
  return rows.map((row) => row.map(toCell));
}

function isSpreadsheet(bytes: Uint8Array): boolean {
  const startsWith = (magic: readonly number[]) => magic.every((byte, i) => bytes[i] === byte);
  return startsWith(XLS_MAGIC) || startsWith(ZIP_MAGIC);
}

/** Texto de un CSV: UTF-8 o, si no lo es, Windows-1252. Un binario no es un extracto. */
function decodeText(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new StatementError('fichero-ilegible');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function toCell(value: unknown): RawCell {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
}
