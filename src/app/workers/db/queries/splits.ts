import {
  checkSplits,
  normalizeSplitLine,
  splitSavePlan,
  type SplitLine,
  type TransactionSplits,
} from '@domain/transactions/transaction-split';
import type { SqlDb } from '../sql-db';
import { positiveId, requireSubcategory } from './transactions';

/**
 * Sustituye los submovimientos de un movimiento por los indicados (ADR-0019), entero o nada:
 * los que siguen conservan su id (y lo compartido y lo devuelto a ellos), los nuevos se dan de
 * alta y los que faltan se borran. Una lista vacía deja el movimiento sin dividir.
 */
export function saveSplits(db: SqlDb, input: TransactionSplits): undefined {
  const splits = input.splits.map(normalizeSplitLine);

  return db.transaction(() => {
    const amount = db.value('SELECT amount_cents FROM transactions WHERE id = ?', [
      input.transactionId,
    ]);
    if (typeof amount !== 'number') throw invalid('transactionId');
    // Lo que un ingreso ya devuelve con lo no dividido no se puede dividir (ADR-0021).
    const refunding = Number(
      db.value(
        `SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
         WHERE reimbursement_tx_id = ? AND reimbursement_split_id IS NULL`,
        [input.transactionId],
      ),
    );
    if (!checkSplits(amount - refunding, splits).valid) throw invalid('partes');
    for (const { categoryId } of splits) {
      if (categoryId !== null) requireSubcategory(db, categoryId);
    }

    const current = db
      .rows('SELECT id, amount_cents FROM transaction_splits WHERE transaction_id = ?', [
        input.transactionId,
      ])
      .map((r) => ({ id: Number(r['id']), amountCents: Number(r['amount_cents']) }));
    const plan = splitSavePlan(current, splits);

    for (const id of plan.deletes) db.run('DELETE FROM transaction_splits WHERE id = ?', [id]);
    for (const split of plan.updates) {
      // Si la parte compartida baja de lo que se esperaba que devolvieran, lo esperado baja con
      // ella: nadie devuelve más de lo que cuesta.
      db.run(
        `UPDATE transaction_splits
         SET description = ?, category_id = ?, amount_cents = ?,
             shared_expected_cents = min(shared_expected_cents, -?)
         WHERE id = ?`,
        [split.description, split.categoryId, split.amountCents, split.amountCents, split.id],
      );
    }
    for (const split of plan.inserts) {
      db.run(
        `INSERT INTO transaction_splits (transaction_id, description, category_id, amount_cents)
         VALUES (?, ?, ?, ?)`,
        [input.transactionId, split.description, split.categoryId, split.amountCents],
      );
    }
    return undefined;
  });
}

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function transactionSplitsParam(params: unknown): TransactionSplits {
  if (typeof params !== 'object' || params === null) throw invalid('forma');
  const { transactionId, splits } = params as Readonly<Record<string, unknown>>;
  if (!positiveId(transactionId)) throw invalid('transactionId');
  if (!Array.isArray(splits)) throw invalid('splits');
  return { transactionId, splits: splits.map(splitLineParam) };
}

function splitLineParam(value: unknown): SplitLine {
  if (typeof value !== 'object' || value === null) throw invalid('parte');
  const { id, description, categoryId, amountCents } = value as Readonly<Record<string, unknown>>;
  if (id !== null && !positiveId(id)) throw invalid('id');
  if (typeof description !== 'string') throw invalid('description');
  if (categoryId !== null && !positiveId(categoryId)) throw invalid('categoryId');
  if (!Number.isSafeInteger(amountCents)) throw invalid('amountCents');
  return { id, description, categoryId, amountCents: Number(amountCents) };
}

const invalid = (field: string) => new RangeError(`Submovimientos no válidos (${field}).`);
