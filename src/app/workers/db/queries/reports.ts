import type { CategoryKind } from '@domain/categories/category-kind';
import { buildMonthReport, type MonthReport } from '@domain/reports/month-report';
import type { TransactionRow } from '@domain/reports/transaction-row';
import { buildYearReport, type YearReport } from '@domain/reports/year-report';
import type { SqlDb, SqlRow } from '../sql-db';

/** La pata de entrada de un traspaso no cuenta en los informes: el dinero ya salió por la otra. */
const NOT_INCOMING_LEG = 't.id NOT IN (SELECT incoming_tx_id FROM transfers)';

/**
 * Lo que suma cada categoría en cada mes (ADR-0013). Un reembolso repartido mueve sus partes:
 * la enlazada a un gasto cuenta en la categoría y el mes del gasto, y la repartida a una
 * subcategoría, en esa subcategoría y el mes del reembolso. En la categoría del reembolso solo
 * queda lo que no se ha repartido. `reimbursed_cents` separa lo devuelto; `n` cuenta
 * movimientos (y cada parte, en su destino). El total de todos los flujos no cambia.
 */
const FLOWS = /* sql */ `
  allocated AS (
    SELECT reimbursement_tx_id, sum(amount_cents) AS cents FROM reimbursements
    GROUP BY reimbursement_tx_id
  ),
  flows (category_id, period, amount_cents, reimbursed_cents, n) AS (
    SELECT t.category_id, t.period, t.amount_cents - ifnull(a.cents, 0), 0,
           CASE WHEN t.amount_cents = ifnull(a.cents, 0) THEN 0 ELSE 1 END
    FROM transactions t LEFT JOIN allocated a ON a.reimbursement_tx_id = t.id
    WHERE ${NOT_INCOMING_LEG}
    UNION ALL
    SELECT e.category_id, e.period, r.amount_cents, r.amount_cents, 1
    FROM reimbursements r JOIN transactions e ON e.id = r.expense_tx_id
    UNION ALL
    SELECT r.category_id, b.period, r.amount_cents, r.amount_cents, 1
    FROM reimbursements r JOIN transactions b ON b.id = r.reimbursement_tx_id
    WHERE r.category_id IS NOT NULL
  )`;

export function listPeriods(db: SqlDb): string[] {
  return db
    .rows('SELECT DISTINCT period FROM transactions ORDER BY period')
    .map((r) => str(r, 'period'));
}

export function monthReport(db: SqlDb, period: string): MonthReport {
  const categories = db
    .rows(
      `WITH ${FLOWS}
       SELECT c.id, c.parent_id, c.name, c.kind, c.color,
              coalesce(sum(f.amount_cents), 0) AS total_cents,
              coalesce(sum(f.reimbursed_cents), 0) AS reimbursed_cents,
              coalesce(sum(f.n), 0) AS tx_count
       FROM categories c
       LEFT JOIN flows f ON f.category_id = c.id AND f.period = ?
       WHERE c.archived = 0
       GROUP BY c.id
       ORDER BY c.sort_order, c.name`,
      [period],
    )
    .map((r) => ({
      id: num(r, 'id'),
      parentId: numOrNull(r, 'parent_id'),
      name: str(r, 'name'),
      kind: strOrNull(r, 'kind') as CategoryKind | null,
      color: strOrNull(r, 'color'),
      totalCents: num(r, 'total_cents'),
      reimbursedCents: num(r, 'reimbursed_cents'),
      count: num(r, 'tx_count'),
    }));

  const [uncategorized] = db.rows(
    `WITH ${FLOWS}
     SELECT coalesce(sum(amount_cents), 0) AS total_cents,
            coalesce(sum(reimbursed_cents), 0) AS reimbursed_cents,
            coalesce(sum(n), 0) AS tx_count
     FROM flows WHERE period = ? AND category_id IS NULL`,
    [period],
  );

  const movements = db
    .rows(
      `WITH allocated AS (
         SELECT reimbursement_tx_id, sum(amount_cents) AS cents FROM reimbursements
         GROUP BY reimbursement_tx_id
       )
       SELECT 't' || t.id AS key, t.id AS tx_id, t.category_id,
              coalesce(t.booked_date, t.op_date) AS date, t.description,
              t.amount_cents - ifnull(a.cents, 0) AS amount_cents, 0 AS reimbursed,
              NULL AS expense_id
       FROM transactions t LEFT JOIN allocated a ON a.reimbursement_tx_id = t.id
       WHERE t.period = ? AND ${NOT_INCOMING_LEG} AND t.amount_cents <> ifnull(a.cents, 0)
       UNION ALL
       SELECT 'r' || r.id, b.id, e.category_id, coalesce(b.booked_date, b.op_date),
              b.description, r.amount_cents, 1, e.id
       FROM reimbursements r
       JOIN transactions e ON e.id = r.expense_tx_id
       JOIN transactions b ON b.id = r.reimbursement_tx_id
       WHERE e.period = ?
       UNION ALL
       SELECT 'r' || r.id, b.id, r.category_id, coalesce(b.booked_date, b.op_date),
              b.description, r.amount_cents, 1, NULL
       FROM reimbursements r JOIN transactions b ON b.id = r.reimbursement_tx_id
       WHERE r.category_id IS NOT NULL AND b.period = ?`,
      [period, period, period],
    )
    .map((r) => ({
      key: str(r, 'key'),
      transactionId: num(r, 'tx_id'),
      categoryId: numOrNull(r, 'category_id'),
      date: str(r, 'date'),
      description: str(r, 'description'),
      amountCents: num(r, 'amount_cents'),
      reimbursed: num(r, 'reimbursed') === 1,
      expenseId: numOrNull(r, 'expense_id'),
    }));

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
      reimbursedCents: uncategorized ? num(uncategorized, 'reimbursed_cents') : 0,
    },
    pendingReimbursementCents: Number(pending),
    movements,
  });
}

/** Hoja anual: el total de cada categoría en cada mes del año. */
export function yearReport(db: SqlDb, year: number): YearReport {
  const categories = db
    .rows(
      `SELECT id, parent_id, name, kind, color FROM categories
       WHERE archived = 0 ORDER BY sort_order, name`,
    )
    .map((r) => ({
      id: num(r, 'id'),
      parentId: numOrNull(r, 'parent_id'),
      name: str(r, 'name'),
      kind: strOrNull(r, 'kind') as CategoryKind | null,
      color: strOrNull(r, 'color'),
    }));

  const pad = String(year).padStart(4, '0');
  const totals = db
    .rows(
      `WITH ${FLOWS}
       SELECT category_id, period, sum(amount_cents) AS total_cents,
              sum(reimbursed_cents) AS reimbursed_cents, sum(n) AS tx_count
       FROM flows
       WHERE period BETWEEN ? AND ?
       GROUP BY category_id, period`,
      [`${pad}-01`, `${pad}-12`],
    )
    .map((r) => ({
      categoryId: numOrNull(r, 'category_id'),
      month: Number(str(r, 'period').slice(5)),
      totalCents: num(r, 'total_cents'),
      reimbursedCents: num(r, 'reimbursed_cents'),
      count: num(r, 'tx_count'),
    }));

  return buildYearReport({ year, categories, totals });
}

export function monthTransactions(db: SqlDb, period: string): TransactionRow[] {
  return transactionRows(db, 'WHERE t.period = ?', [period]);
}

/** Todos los movimientos, del más reciente al más antiguo. */
export function allTransactions(db: SqlDb): TransactionRow[] {
  return transactionRows(db, '', []);
}

/** `where` es siempre un literal de este fichero; los valores van en `bind`. */
function transactionRows(db: SqlDb, where: string, bind: readonly string[]): TransactionRow[] {
  return db
    .rows(
      `SELECT t.id, t.op_date, coalesce(t.booked_date, t.op_date) AS booked_date,
              t.booked_date IS NOT NULL AND t.booked_date <> t.op_date AS date_changed,
              t.period, t.description, t.original_description, t.note, t.amount_cents,
              a.name AS account_name, t.category_id,
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
       ${where}
       ORDER BY t.op_date DESC, t.id DESC`,
      bind,
    )
    .map((r) => ({
      id: num(r, 'id'),
      opDate: str(r, 'op_date'),
      bookedDate: str(r, 'booked_date'),
      dateChanged: num(r, 'date_changed') === 1,
      period: str(r, 'period'),
      description: str(r, 'description'),
      originalDescription: strOrNull(r, 'original_description'),
      note: strOrNull(r, 'note'),
      amountCents: num(r, 'amount_cents'),
      accountName: str(r, 'account_name'),
      categoryId: numOrNull(r, 'category_id'),
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
