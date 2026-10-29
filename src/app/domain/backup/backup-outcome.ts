import type { BackupErrorCode } from './database-file';

export type BackupTask = 'exportando' | 'cargando';

/** Por qué no hay nada que descargar. */
export type ExportBlock = 'demo' | 'sin-datos';

/** Cómo terminó bien la última tarea. */
export type BackupNotice =
  | { readonly task: 'exportando'; readonly fileName: string }
  | { readonly task: 'cargando'; readonly fileName: string; readonly transactions: number };

/** Por qué falló la última tarea. */
export type BackupFailure =
  | { readonly task: 'exportando' }
  | { readonly task: 'cargando'; readonly code: BackupErrorCode | 'desconocido' };
