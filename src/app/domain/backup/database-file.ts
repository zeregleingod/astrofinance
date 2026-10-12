import { isIsoDate } from '../dates/period';

/** Una BD con años de movimientos ocupa pocos MB: por encima de esto no es una copia. */
export const MAX_DATABASE_BYTES = 64 * 1024 * 1024;

/** `SQLite format 3` seguido de un byte nulo: los 16 primeros bytes de toda BD de SQLite. */
const SQLITE_HEADER = [...'SQLite format 3'].map((char) => char.charCodeAt(0)).concat(0);

export const BACKUP_ERROR_CODES = [
  'fichero-vacio',
  'fichero-demasiado-grande',
  'no-es-sqlite',
  'fichero-danado',
  'esquema-ajeno',
  'version-futura',
] as const;

export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number];

/** Lo que se sabe de una copia recién cargada. */
export interface RestoredDatabase {
  readonly transactions: number;
}

/** El código de un `BackupError`, también si ha cruzado entre hilos; si no, `null`. */
export function backupErrorCode(error: unknown): BackupErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'BackupError') return null;
  return BACKUP_ERROR_CODES.find((code) => code === error.message) ?? null;
}

/** Error que impide cargar una copia. `message` es el código: sobrevive al paso entre hilos. */
export class BackupError extends Error {
  override readonly name = 'BackupError';

  constructor(readonly code: BackupErrorCode) {
    super(code);
  }
}

/**
 * Primer filtro de un fichero que dice ser una copia (T2.11), antes de dárselo a SQLite: es
 * entrada no confiable y el tipo se decide por el contenido, no por la extensión.
 */
export function checkDatabaseFile(bytes: Uint8Array): void {
  if (bytes.length === 0) throw new BackupError('fichero-vacio');
  if (bytes.length > MAX_DATABASE_BYTES) throw new BackupError('fichero-demasiado-grande');
  if (!SQLITE_HEADER.every((byte, i) => bytes[i] === byte)) throw new BackupError('no-es-sqlite');
}

/** Nombre del fichero de una copia hecha el día `isoDate` (`AAAA-MM-DD`). */
export function backupFileName(isoDate: string): string {
  if (!isIsoDate(isoDate)) throw new RangeError('Fecha no válida (AAAA-MM-DD).');
  return `astrofinance-${isoDate}.db`;
}
