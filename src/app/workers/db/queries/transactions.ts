import { isIsoDate } from '@domain/dates/period';
import {
  normalizeTransactionEdit,
  transactionEditErrors,
  type TransactionEdit,
} from '@domain/transactions/transaction-edit';
import type { SqlDb } from '../sql-db';

/**
 * Guarda lo que el usuario ha cambiado de un movimiento (T5.2, ADR-0016): concepto, fecha
 * imputada, subcategoría y observaciones. Elegir categoría a mano la protege de las reglas
 * (`category_source = 'manual'`); si la categoría no cambia, conserva su origen.
 */
export function updateTransaction(db: SqlDb, input: TransactionEdit): undefined {
  const edit = normalizeTransactionEdit(input);
  if (transactionEditErrors(edit).length > 0) throw invalid('campos');

  return db.transaction(() => {
    const [current] = db.rows('SELECT op_date, category_id FROM transactions WHERE id = ?', [
      edit.id,
    ]);
    if (!current) throw invalid('id');
    // Imputarlo a su propia fecha es no imputarlo a otra.
    const bookedDate = edit.bookedDate === current['op_date'] ? null : edit.bookedDate;

    db.run(
      `UPDATE transactions
       SET description = ?, booked_date = ?, note = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      [edit.description, bookedDate, edit.note, edit.id],
    );

    if (edit.categoryId !== current['category_id']) {
      if (edit.categoryId !== null) requireSubcategory(db, edit.categoryId);
      db.run(
        `UPDATE transactions SET category_id = ?, category_source = ?, rule_id = NULL
         WHERE id = ?`,
        [edit.categoryId, edit.categoryId === null ? 'ninguna' : 'manual', edit.id],
      );
    }
    return undefined;
  });
}

/** A un movimiento (o a un submovimiento) solo se le asignan subcategorías (ADR-0009). */
export function requireSubcategory(db: SqlDb, id: number): void {
  const found = db.value(
    'SELECT 1 FROM categories WHERE id = ? AND parent_id IS NOT NULL AND archived = 0',
    [id],
  );
  if (found === undefined) throw invalid('categoryId');
}

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function transactionEditParam(params: unknown): TransactionEdit {
  if (typeof params !== 'object' || params === null) throw invalid('forma');
  const {
    id,
    description,
    bookedDate,
    categoryId = null,
    note = null,
  } = params as Readonly<Record<string, unknown>>;
  if (!positiveId(id)) throw invalid('id');
  if (typeof description !== 'string') throw invalid('description');
  if (!isIsoDate(bookedDate)) throw invalid('bookedDate');
  if (categoryId !== null && !positiveId(categoryId)) throw invalid('categoryId');
  if (note !== null && typeof note !== 'string') throw invalid('note');
  return { id, description, bookedDate, categoryId, note };
}

export const positiveId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const invalid = (field: string) => new RangeError(`Movimiento no válido (${field}).`);
