import type { CategoryKind } from '@domain/categories/category-kind';
import { buildMonthReport, type MonthReport } from '@domain/reports/month-report';
import type { TransactionRow } from '@domain/reports/transaction-row';
import type { SqlDb, SqlRow } from '../sql-db';

/** La pata de entrada de un traspaso no cuenta en los informes: el dinero ya salió por la otra. */
const NOT_INCOMING_LEG = 't.id NOT IN (SELECT incoming_tx_id FROM transfers)';

export function listPeriods(db: SqlDb): string[] {
  return db
    .rows('SELECT DISTINCT period FROM transactions ORDER BY period')
    .map((r) => str(r, 'period'));
}

export function monthReport(db: SqlDb, period: string): MonthReport {
  const categories = db
    .rows(
      `SELECT c.id, c.parent_id, c.name, c.kind, c.color,
              coalesce(sum(t.amount_cents), 0) AS total_cents, count(t.id) AS tx_count
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id AND t.period = ? AND ${NOT_INCOMING_LEG}
       WHERE c.archived = 0
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`,
      [period],
    )
    .map((r) => ({
      id: num(r, 'id'),
      parentId: numOrNull(r, 'parent_id'),
      name: str(r, 'name'),
      kind: str(r, 'kind') as CategoryKind,
      color: strOrNull(r, 'color'),
      totalCents: num(r, 'total_cents'),
      count: num(r, 'tx_count'),
    }));

  const [uncategorized] = db.rows(
    `SELECT coalesce(sum(t.amount_cents), 0) AS total_cents, count(*) AS tx_count
     FROM transactions t WHERE t.period = ? AND t.category_id IS NULL AND ${NOT_INCOMING_LEG}`,
    [period],
  );

  const pending = db.value(
    `SELECT coalesce(sum(s.pending_cents), 0) FROM shared_expense_status s
     JOIN transactions t ON t.id = s.transaction_id WHERE t.period = ?`,
    [period],
  );

  return buildMonthReport({
    period,
    categories,
    uncategorized: {
      totalCents: uncategorized ? num(uncategorized, 'total_cents') : 0,
      count: uncategorized ? num(uncategorized, 'tx_count') : 0,
    },
    pendingReimbursementCents: Number(pending),
  });
}

export function monthTransactions(db: SqlDb, period: string): TransactionRow[] {
  return db
    .rows(
      `SELECT t.id, t.op_date, coalesce(t.booked_date, t.op_date) AS booked_date,
              t.booked_date IS NOT NULL AND t.booked_date <> t.op_date AS date_changed,
              t.period, t.description, t.note, t.amount_cents, a.name AS account_name,
              coalesce(p.name, c.name) AS category_name,
              CASE WHEN p.id IS NULL THEN NULL ELSE c.name END AS subcategory_name,
              EXISTS (SELECT 1 FROM shared_expenses s WHERE s.transaction_id = t.id) AS shared,
              EXISTS (SELECT 1 FROM reimbursements r WHERE r.reimbursement_tx_id = t.id) AS reimbursement,
              EXISTS (SELECT 1 FROM transfers x
                      WHERE x.outgoing_tx_id = t.id OR x.incoming_tx_id = t.id) AS transfer,
              (SELECT i.number || '/' || l.installments_total FROM loan_installments i
               JOIN loans l ON l.id = i.loan_id WHERE i.transaction_id = t.id) AS installment
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE t.period = ?
       ORDER BY t.op_date DESC, t.id DESC`,
      [period],
    )
    .map((r) => ({
      id: num(r, 'id'),
      opDate: str(r, 'op_date'),
      bookedDate: str(r, 'booked_date'),
      dateChanged: num(r, 'date_changed') === 1,
      period: str(r, 'period'),
      description: str(r, 'description'),
      note: strOrNull(r, 'note'),
      amountCents: num(r, 'amount_cents'),
      accountName: str(r, 'account_name'),
      categoryName: strOrNull(r, 'category_name'),
      subcategoryName: strOrNull(r, 'subcategory_name'),
      shared: num(r, 'shared') === 1,
      reimbursement: num(r, 'reimbursement') === 1,
      transfer: num(r, 'transfer') === 1,
      installment: strOrNull(r, 'installment'),
    }));
}

function num(row: SqlRow, key: string): number {
  const value = row[key];
  if (typeof value !== 'number') throw new TypeError(`La columna ${key} no es numérica.`);
  return value;
}

function numOrNull(row: SqlRow, key: string): number | null {
  return row[key] === null ? null : num(row, key);
}

function str(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new TypeError(`La columna ${key} no es texto.`);
  return value;
}

function strOrNull(row: SqlRow, key: string): string | null {
  return row[key] === null ? null : str(row, key);
}
