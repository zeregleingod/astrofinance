/** Movimiento revisado por el usuario, listo para guardarse. */
export interface ImportRowInput {
  readonly opDate: string;
  readonly valueDate: string | null;
  readonly amountCents: number;
  readonly balanceAfterCents: number | null;
  /** Concepto que se muestra: el original o el que haya escrito el usuario. */
  readonly description: string;
  /** Concepto del banco, intacto. */
  readonly originalDescription: string;
  readonly note: string | null;
  readonly bankReference: string | null;
  readonly categoryId: number | null;
  readonly dedupeHash: string;
}

/** Lote que se confirma tras la revisión. Se guarda entero o no se guarda nada. */
export interface ImportBatchInput {
  readonly profileId: string;
  readonly institution: string;
  readonly ibanLast4: string | null;
  readonly fileName: string;
  readonly fileSha256: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  /** Saldo anterior al extracto; solo se usa al dar de alta la cuenta. */
  readonly openingBalanceCents: number | null;
  readonly rows: readonly ImportRowInput[];
  /** Movimientos del fichero que ya estaban guardados. */
  readonly duplicateCount: number;
  /** Filas del fichero que no se pudieron leer. */
  readonly errorCount: number;
}

export interface ImportBatchResult {
  readonly inserted: number;
  /** Ya guardados: los que se sabían al revisar más los detectados al confirmar. */
  readonly duplicates: number;
  readonly accountName: string;
  /** Meses que han recibido movimientos, en orden. */
  readonly periods: readonly string[];
}

/** Categoría que se puede asignar a un movimiento: siempre una subcategoría. */
export interface CategoryOption {
  readonly id: number;
  /** `Principal › Subcategoría`. */
  readonly label: string;
}
