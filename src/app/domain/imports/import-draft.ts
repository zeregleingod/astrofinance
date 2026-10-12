import { centsToInput, parseCents } from '../money/parse-cents';
import type { ImportBatchInput, ImportRowInput } from './import-batch';
import type { ImportedMovement, ImportedStatement } from './imported-statement';

const MAX_TEXT = 500;

/** Fila de la revisión previa: el movimiento del banco y lo que el usuario ha cambiado. */
export interface DraftRow {
  readonly movement: ImportedMovement;
  /** Ya está guardado (misma huella): no se puede volver a guardar. */
  readonly duplicate: boolean;
  /** El usuario quiere guardarlo. */
  readonly included: boolean;
  readonly description: string;
  /** Importe tal como está escrito en la casilla (es-ES). */
  readonly amountText: string;
  readonly categoryId: number | null;
  readonly note: string;
}

export type DraftField = 'description' | 'amount' | 'note';
export type DraftEdit = Partial<
  Pick<DraftRow, 'included' | 'description' | 'amountText' | 'categoryId' | 'note'>
>;

export interface DraftSummary {
  readonly total: number;
  /** Se guardarán al confirmar. */
  readonly toSave: number;
  readonly duplicates: number;
  /** Descartados a mano por el usuario. */
  readonly excluded: number;
  /** Incluidos pero con algún dato no válido: impiden guardar. */
  readonly invalid: number;
}

export function createDraft(
  statement: Pick<ImportedStatement, 'movements'>,
  existingHashes: ReadonlySet<string>,
): DraftRow[] {
  return statement.movements.map((movement) => {
    const duplicate = existingHashes.has(movement.dedupeHash);
    return {
      movement,
      duplicate,
      included: !duplicate,
      description: movement.description,
      amountText: centsToInput(movement.amountCents),
      categoryId: null,
      note: '',
    };
  });
}

/** Aplica un cambio a una fila sin mutar el borrador. Un duplicado nunca pasa a incluido. */
export function editDraft(rows: readonly DraftRow[], index: number, edit: DraftEdit): DraftRow[] {
  return rows.map((row, i) =>
    i === index
      ? { ...row, ...edit, included: !row.duplicate && (edit.included ?? row.included) }
      : row,
  );
}

/** Importe escrito por el usuario; `null` si no es un importe o es cero. */
export function draftAmountCents(row: DraftRow): number | null {
  const cents = parseCents(row.amountText);
  return cents === 0 ? null : cents;
}

/** Campos que impiden guardar la fila. Las filas que no se van a guardar no se validan. */
export function draftErrors(row: DraftRow): DraftField[] {
  if (!row.included) return [];
  const description = row.description.trim();
  const errors: DraftField[] = [];
  if (description === '' || description.length > MAX_TEXT) errors.push('description');
  if (draftAmountCents(row) === null) errors.push('amount');
  if (row.note.trim().length > MAX_TEXT) errors.push('note');
  return errors;
}

/** El usuario ha cambiado el concepto o el importe respecto a lo que dice el banco. */
export function isEdited(row: DraftRow): boolean {
  return (
    row.description.trim() !== row.movement.description ||
    draftAmountCents(row) !== row.movement.amountCents
  );
}

export function summarizeDraft(rows: readonly DraftRow[]): DraftSummary {
  const duplicates = rows.filter((row) => row.duplicate).length;
  const included = rows.filter((row) => row.included);
  const invalid = included.filter((row) => draftErrors(row).length > 0).length;
  return {
    total: rows.length,
    toSave: included.length - invalid,
    duplicates,
    excluded: rows.length - duplicates - included.length,
    invalid,
  };
}

/** Lote a confirmar. Lanza `RangeError` si queda alguna fila incluida sin corregir. */
export function draftToBatch(
  statement: Omit<ImportedStatement, 'movements'>,
  rows: readonly DraftRow[],
): ImportBatchInput {
  const summary = summarizeDraft(rows);
  if (summary.invalid > 0) throw new RangeError('Hay movimientos con datos no válidos.');
  return {
    profileId: statement.profileId,
    institution: statement.institution,
    ibanLast4: statement.ibanLast4,
    fileName: statement.fileName,
    fileSha256: statement.fileSha256,
    dateFrom: statement.dateFrom,
    dateTo: statement.dateTo,
    openingBalanceCents: statement.openingBalanceCents,
    rows: rows.filter((row) => row.included).map(toRowInput),
    duplicateCount: summary.duplicates,
    errorCount: statement.errors.length,
  };
}

function toRowInput(row: DraftRow): ImportRowInput {
  const { movement } = row;
  return {
    opDate: movement.opDate,
    valueDate: movement.valueDate,
    amountCents: draftAmountCents(row) ?? movement.amountCents,
    balanceAfterCents: movement.balanceAfterCents,
    description: row.description.trim(),
    originalDescription: movement.description,
    note: row.note.trim() || null,
    bankReference: movement.reference,
    categoryId: row.categoryId,
    dedupeHash: movement.dedupeHash,
  };
}
