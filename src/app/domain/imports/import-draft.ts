import { centsToInput, parseCents } from '../money/parse-cents';
import type { CategorySuggestion } from '../suggestions/category-suggestion';
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
  /** La categoría que se propuso al leer el extracto (ADR-0018), aunque el usuario la cambie. */
  readonly suggestion: CategorySuggestion | null;
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

/** Movimientos incluidos que conservan la categoría propuesta, según de dónde salió. */
export interface SuggestedCount {
  readonly byRule: number;
  readonly byHistory: number;
}

/**
 * El borrador de la revisión. `suggestions` va en el orden de los movimientos: la categoría
 * propuesta para cada uno viene ya puesta, salvo en los que ya estaban guardados.
 */
export function createDraft(
  statement: Pick<ImportedStatement, 'movements'>,
  existingHashes: ReadonlySet<string>,
  suggestions: readonly (CategorySuggestion | null)[] = [],
): DraftRow[] {
  return statement.movements.map((movement, i) => {
    const duplicate = existingHashes.has(movement.dedupeHash);
    const suggestion = duplicate ? null : (suggestions[i] ?? null);
    return {
      movement,
      duplicate,
      included: !duplicate,
      description: movement.description,
      amountText: centsToInput(movement.amountCents),
      categoryId: suggestion?.categoryId ?? null,
      suggestion,
      note: '',
    };
  });
}

/** La propuesta, si la fila aún tiene la categoría propuesta; si el usuario la cambió, `null`. */
export function suggestionInUse(row: DraftRow): CategorySuggestion | null {
  return row.suggestion && row.suggestion.categoryId === row.categoryId ? row.suggestion : null;
}

export function countSuggested(rows: readonly DraftRow[]): SuggestedCount {
  const sources = rows.filter((row) => row.included).map((row) => suggestionInUse(row)?.source);
  return {
    byRule: sources.filter((source) => source === 'regla').length,
    byHistory: sources.filter((source) => source === 'sugerencia').length,
  };
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
  const suggestion = suggestionInUse(row);
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
    // Lo que el usuario elige a mano es suyo; lo propuesto conserva su origen (ADR-0018).
    categorySource: row.categoryId === null ? 'ninguna' : (suggestion?.source ?? 'manual'),
    ruleId: suggestion?.source === 'regla' ? suggestion.ruleId : null,
    dedupeHash: movement.dedupeHash,
  };
}
