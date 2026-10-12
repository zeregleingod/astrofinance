/** Celda de una hoja tal como llega del lector de ficheros: sin fórmulas ni formato. */
export type RawCell = string | number | null;
export type RawSheet = readonly (readonly RawCell[])[];

/** Movimiento leído de un extracto, todavía sin revisar ni guardar. */
export interface StatementMovement {
  /** Fila de la hoja (1 = la primera), para señalar avisos al usuario. */
  readonly row: number;
  readonly opDate: string;
  readonly valueDate: string | null;
  /** Concepto tal como lo escribe el banco. */
  readonly description: string;
  readonly amountCents: number;
  readonly balanceAfterCents: number | null;
  readonly reference: string | null;
}

export type StatementField = 'fecha' | 'concepto' | 'importe';

/** Fila que no se ha podido leer; no aborta el resto del extracto. */
export interface StatementRowError {
  readonly row: number;
  readonly field: StatementField;
}

/** Lo que un perfil bancario extrae de una hoja. Nunca incluye el titular ni el IBAN completo. */
export interface ProfileStatement {
  readonly ibanLast4: string | null;
  /** Periodo que declara el propio fichero, si lo indica. */
  readonly declaredFrom: string | null;
  readonly declaredTo: string | null;
  /** En el orden del fichero. */
  readonly movements: readonly StatementMovement[];
  readonly errors: readonly StatementRowError[];
}

export interface BankStatement {
  readonly profileId: string;
  readonly institution: string;
  readonly ibanLast4: string | null;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly movements: readonly StatementMovement[];
  readonly errors: readonly StatementRowError[];
}

/** Un extracto mensual ocupa decenas de KB: por encima de esto no es un extracto. */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;
export const MAX_STATEMENT_ROWS = 20_000;

export const STATEMENT_ERROR_CODES = [
  'formato-desconocido',
  'divisa-no-admitida',
  'sin-movimientos',
  'fichero-vacio',
  'fichero-demasiado-grande',
  'fichero-ilegible',
] as const;

export type StatementErrorCode = (typeof STATEMENT_ERROR_CODES)[number];

/** El código de un `StatementError`, también si ha cruzado entre hilos; si no, `null`. */
export function statementErrorCode(error: unknown): StatementErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'StatementError') return null;
  return STATEMENT_ERROR_CODES.find((code) => code === error.message) ?? null;
}

/** Error que impide leer el extracto. `message` es el código: sobrevive al paso entre hilos. */
export class StatementError extends Error {
  override readonly name = 'StatementError';

  constructor(readonly code: StatementErrorCode) {
    super(code);
  }
}
