import { isIsoDate } from '../dates/period';

/** Longitud máxima del concepto y de las observaciones, como en el esquema. */
export const TRANSACTION_TEXT_MAX = 500;

/**
 * Lo que el usuario puede cambiar de un movimiento ya guardado (T5.2). El importe, la fecha
 * original, la cuenta y el concepto del banco son del extracto y no se editan (ADR-0016).
 */
export interface TransactionEdit {
  readonly id: number;
  /** Concepto que se muestra; el del banco se conserva aparte (ADR-0007). */
  readonly description: string;
  /** Fecha imputada `AAAA-MM-DD`: la original si no se quiere imputar a otro día. */
  readonly bookedDate: string;
  /** Subcategoría, o `null` para dejarlo sin categoría. */
  readonly categoryId: number | null;
  readonly note: string | null;
}

export type TransactionEditField = 'description' | 'bookedDate' | 'note';

/** Campos que impiden guardar el cambio. */
export function transactionEditErrors(
  edit: Pick<TransactionEdit, 'description' | 'bookedDate' | 'note'>,
): TransactionEditField[] {
  const errors: TransactionEditField[] = [];
  const description = edit.description.trim();
  if (description === '' || description.length > TRANSACTION_TEXT_MAX) errors.push('description');
  if (!isIsoDate(edit.bookedDate)) errors.push('bookedDate');
  if ((edit.note ?? '').trim().length > TRANSACTION_TEXT_MAX) errors.push('note');
  return errors;
}

/** El cambio tal como se guarda: textos sin espacios en los extremos y observación vacía a `null`. */
export function normalizeTransactionEdit(edit: TransactionEdit): TransactionEdit {
  return {
    ...edit,
    description: edit.description.trim(),
    note: edit.note?.trim() || null,
  };
}
