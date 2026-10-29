import {
  checkRefunds,
  refundSavePlan,
  refundSourceKey,
  type ExpenseRefundOptions,
  type ExpenseRefunds,
  type RefundCandidate,
  type RefundLink,
} from '@domain/transactions/refund';
import type { SqlDb } from '../sql-db';
import { positiveId } from './transactions';

/**
 * Lo que puede devolver un gasto (ADR-0021): lo que cada ingreso no ha dividido y cada
 * submovimiento de un ingreso (el Bizum de suministros dividido en luz, agua y gas), si tienen algo
 * libre o ya lo devuelven. Primero los posteriores al gasto (las devoluciones llegan después),
 * del más cercano al más lejano, y luego los anteriores. No se ofrece la entrada de un traspaso,
 * que no cuenta en los informes, ni sus submovimientos.
 */
export function expenseRefundOptions(db: SqlDb, expenseId: number): ExpenseRefundOptions {
  const date = db.value(
    'SELECT coalesce(booked_date, op_date) FROM transactions WHERE id = ? AND amount_cents < 0',
    [expenseId],
  );
  if (typeof date !== 'string') throw invalid('expenseId');

  const candidates = db
    .rows(
      `SELECT * FROM (
         SELECT t.id, NULL AS split_id, coalesce(t.booked_date, t.op_date) AS date,
                t.description, a.name AS account_name, t.amount_cents,
                t.amount_cents
                  - ifnull((SELECT sum(s.amount_cents) FROM transaction_splits s
                            WHERE s.transaction_id = t.id), 0)
                  - ifnull((SELECT sum(r.amount_cents) FROM reimbursements r
                            WHERE r.reimbursement_tx_id = t.id AND r.reimbursement_split_id IS NULL
                              AND r.expense_tx_id IS NOT ?), 0) AS available_cents,
                (SELECT r.amount_cents FROM reimbursements r
                 WHERE r.reimbursement_tx_id = t.id AND r.reimbursement_split_id IS NULL
                   AND r.expense_tx_id = ?) AS linked_cents
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE t.amount_cents > 0 AND t.id NOT IN (SELECT incoming_tx_id FROM transfers)
         UNION ALL
         SELECT t.id, s.id, coalesce(t.booked_date, t.op_date), t.description || ' › ' || s.description,
                a.name, s.amount_cents,
                s.amount_cents
                  - ifnull((SELECT sum(r.amount_cents) FROM reimbursements r
                            WHERE r.reimbursement_split_id = s.id
                              AND r.expense_tx_id IS NOT ?), 0),
                (SELECT r.amount_cents FROM reimbursements r
                 WHERE r.reimbursement_split_id = s.id AND r.expense_tx_id = ?)
         FROM transaction_splits s
         JOIN transactions t ON t.id = s.transaction_id
         JOIN accounts a ON a.id = t.account_id
         WHERE s.amount_cents > 0 AND t.id NOT IN (SELECT incoming_tx_id FROM transfers))
       WHERE available_cents > 0 OR linked_cents IS NOT NULL
       ORDER BY date < ?, abs(julianday(date) - julianday(?)), id, ifnull(split_id, 0)`,
      [expenseId, expenseId, expenseId, expenseId, date, date],
    )
    .map((r): RefundCandidate => ({
      id: Number(r['id']),
      splitId: r['split_id'] === null ? null : Number(r['split_id']),
      date: String(r['date']),
      description: String(r['description']),
      accountName: String(r['account_name']),
      amountCents: Number(r['amount_cents']),
      availableCents: Number(r['available_cents']),
      linkedCents: r['linked_cents'] === null ? null : Number(r['linked_cents']),
    }));
  return { expenseId, candidates };
}

/**
 * Sustituye las devoluciones de un gasto por las indicadas, entero o nada: las que siguen cambian
 * su importe, las nuevas se dan de alta y las que faltan se quitan. Una lista vacía lo deja sin
 * devoluciones. Lo que esos ingresos devuelven de otros gastos o subcategorías no se toca.
 */
export function saveRefunds(db: SqlDb, input: ExpenseRefunds): undefined {
  return db.transaction(() => {
    const expense = db.value('SELECT amount_cents FROM transactions WHERE id = ?', [
      input.expenseId,
    ]);
    if (typeof expense !== 'number' || expense >= 0) throw invalid('expenseId');

    const available = new Map(
      expenseRefundOptions(db, input.expenseId).candidates.map((c) => [
        refundSourceKey({ reimbursementTxId: c.id, reimbursementSplitId: c.splitId }),
        c.availableCents,
      ]),
    );
    if (!checkRefunds(expense, input.links, available).valid) throw invalid('links');

    const current = db
      .rows(
        `SELECT reimbursement_tx_id, reimbursement_split_id, amount_cents FROM reimbursements
         WHERE expense_tx_id = ?`,
        [input.expenseId],
      )
      .map((r): RefundLink => ({
        reimbursementTxId: Number(r['reimbursement_tx_id']),
        reimbursementSplitId:
          r['reimbursement_split_id'] === null ? null : Number(r['reimbursement_split_id']),
        amountCents: Number(r['amount_cents']),
      }));
    const plan = refundSavePlan(current, input.links);
    const source = `expense_tx_id = ? AND reimbursement_tx_id = ? AND reimbursement_split_id IS ?`;

    for (const link of plan.deletes) {
      db.run(`DELETE FROM reimbursements WHERE ${source}`, [
        input.expenseId,
        link.reimbursementTxId,
        link.reimbursementSplitId,
      ]);
    }
    for (const link of plan.updates) {
      db.run(`UPDATE reimbursements SET amount_cents = ? WHERE ${source}`, [
        link.amountCents,
        input.expenseId,
        link.reimbursementTxId,
        link.reimbursementSplitId,
      ]);
    }
    for (const link of plan.inserts) {
      db.run(
        `INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, reimbursement_split_id,
           amount_cents)
         VALUES (?, ?, ?, ?)`,
        [input.expenseId, link.reimbursementTxId, link.reimbursementSplitId, link.amountCents],
      );
    }
    return undefined;
  });
}

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function expenseRefundsParam(params: unknown): ExpenseRefunds {
  if (typeof params !== 'object' || params === null) throw invalid('forma');
  const { expenseId, links } = params as Readonly<Record<string, unknown>>;
  if (!positiveId(expenseId)) throw invalid('expenseId');
  if (!Array.isArray(links)) throw invalid('links');
  return { expenseId, links: links.map(linkParam) };
}

/** El gasto del que se piden las devoluciones posibles. */
export function expenseIdParam(params: unknown): number {
  const id: unknown =
    typeof params === 'object' && params !== null
      ? (params as { expenseId?: unknown }).expenseId
      : undefined;
  if (!positiveId(id)) throw invalid('expenseId');
  return id;
}

function linkParam(value: unknown): RefundLink {
  if (typeof value !== 'object' || value === null) throw invalid('devolución');
  const {
    reimbursementTxId,
    reimbursementSplitId = null,
    amountCents,
  } = value as Readonly<Record<string, unknown>>;
  if (!positiveId(reimbursementTxId)) throw invalid('reimbursementTxId');
  if (reimbursementSplitId !== null && !positiveId(reimbursementSplitId)) {
    throw invalid('reimbursementSplitId');
  }
  if (!Number.isSafeInteger(amountCents)) throw invalid('amountCents');
  return { reimbursementTxId, reimbursementSplitId, amountCents: Number(amountCents) };
}

const invalid = (field: string) => new RangeError(`Devoluciones no válidas (${field}).`);
