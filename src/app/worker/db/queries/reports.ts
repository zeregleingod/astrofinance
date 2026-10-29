import type { CategoryKind } from '@domain/categories/category-kind';
import { buildMonthReport, type MonthReport } from '@domain/reports/month-report';
import type { SummaryTotal } from '@domain/reports/summary-origin';
import type {
  RefundRow,
  SplitRow,
  TransactionLink,
  TransactionLinkKind,
  TransactionRow,
} from '@domain/reports/transaction-row';
import { buildYearReport, type YearReport } from '@domain/reports/year-report';
import type { SqlDb, SqlRow } from '../sql-db';

/** La pata de entrada de un traspaso no cuenta en los informes: el dinero ya salió por la otra. */
const NOT_INCOMING_LEG = 't.id NOT IN (SELECT incoming_tx_id FROM transfers)';

/**
 * Lo que sale de cada movimiento hacia otro sitio (`allocated`): sus submovimientos (ADR-0019)
 * y lo que devuelve con lo que no ha dividido (ADR-0013, ADR-0021). Y lo que sale de cada
 * submovimiento (`split_allocated`): lo que devuelve, si es de un ingreso (el Bizum de
 * suministros dividido que devuelve cada factura con su parte).
 */
const ALLOCATED = /* sql */ `
  allocated AS (
    SELECT tx_id, sum(cents) AS cents
    FROM (SELECT reimbursement_tx_id AS tx_id, amount_cents AS cents FROM reimbursements
          WHERE reimbursement_split_id IS NULL
          UNION ALL
          SELECT transaction_id, amount_cents FROM transaction_splits)
    GROUP BY tx_id
  ),
  split_allocated AS (
    SELECT reimbursement_split_id AS split_id, sum(amount_cents) AS cents FROM reimbursements
    WHERE reimbursement_split_id IS NOT NULL
    GROUP BY reimbursement_split_id
  )`;

/** Cómo se nombra el origen de una devolución: el ingreso y, si sale de una parte suya, cuál. */
const SOURCE_NAME = "b.description || ifnull(' › ' || src.description, '')";

/**
 * La parte de un reembolso enlazada a un gasto entero (ADR-0013), repartida en el destino del
 * gasto (ADR-0019). Si el gasto se ha dividido, se reparte en proporción a cada submovimiento
 * (`whole_shares`, céntimos truncados) y lo demás va al resto sin dividir (`whole_rest`); si no
 * queda resto, los céntimos del redondeo van al último submovimiento. Sin submovimientos,
 * `whole_rest` es la parte entera, en la categoría del gasto.
 */
const WHOLE_SHARES = /* sql */ `
  whole_shares (reimbursement_id, reimbursement_tx_id, source_split_id, expense_id, split_id,
                category_id, period, cents) AS (
    SELECT reimbursement_id, reimbursement_tx_id, source_split_id, expense_id, split_id,
           category_id, period,
           CASE WHEN last = 1 AND whole THEN amount - (total - base) ELSE base END
    FROM (SELECT r.id AS reimbursement_id, r.reimbursement_tx_id,
                 r.reimbursement_split_id AS source_split_id, e.id AS expense_id,
                 s.id AS split_id, s.category_id, e.period, r.amount_cents AS amount,
                 r.amount_cents * s.amount_cents / e.amount_cents AS base,
                 sum(r.amount_cents * s.amount_cents / e.amount_cents)
                   OVER (PARTITION BY r.id) AS total,
                 row_number() OVER (PARTITION BY r.id ORDER BY s.id DESC) AS last,
                 e.amount_cents = sum(s.amount_cents) OVER (PARTITION BY r.id) AS whole
          FROM reimbursements r
          JOIN transactions e ON e.id = r.expense_tx_id
          JOIN transaction_splits s ON s.transaction_id = e.id)
  ),
  whole_rest (reimbursement_id, reimbursement_tx_id, source_split_id, expense_id, category_id,
              period, cents) AS (
    SELECT r.id, r.reimbursement_tx_id, r.reimbursement_split_id, e.id, e.category_id, e.period,
           r.amount_cents - ifnull((SELECT sum(w.cents) FROM whole_shares w
                                    WHERE w.reimbursement_id = r.id), 0)
    FROM reimbursements r JOIN transactions e ON e.id = r.expense_tx_id
  )`;

/**
 * Lo que suma cada categoría en cada mes. Un reembolso repartido mueve sus partes (ADR-0013):
 * la enlazada a un gasto cuenta en el destino y el mes del gasto (`WHOLE_SHARES`), la enlazada a un
 * submovimiento, en la de este y el mes de su movimiento, y la repartida a una subcategoría, en
 * esa subcategoría y el mes del reembolso. Un submovimiento cuenta en su subcategoría y el mes
 * de su movimiento (ADR-0019). En el movimiento solo queda lo que no se ha repartido ni
 * dividido. `reimbursed_cents` separa lo devuelto; `n` cuenta movimientos (y cada parte, en su
 * destino). El total de todos los flujos no cambia.
 */
const FLOWS = /* sql */ `
  ${ALLOCATED},
  ${WHOLE_SHARES},
  flows (category_id, period, amount_cents, reimbursed_cents, n) AS (
    SELECT t.category_id, t.period, t.amount_cents - ifnull(a.cents, 0), 0,
           CASE WHEN t.amount_cents = ifnull(a.cents, 0) THEN 0 ELSE 1 END
    FROM transactions t LEFT JOIN allocated a ON a.tx_id = t.id
    WHERE ${NOT_INCOMING_LEG}
    UNION ALL
    SELECT s.category_id, t.period, s.amount_cents - ifnull(sa.cents, 0), 0,
           CASE WHEN s.amount_cents = ifnull(sa.cents, 0) THEN 0 ELSE 1 END
    FROM transaction_splits s JOIN transactions t ON t.id = s.transaction_id
    LEFT JOIN split_allocated sa ON sa.split_id = s.id
    WHERE ${NOT_INCOMING_LEG}
    UNION ALL
    SELECT category_id, period, cents, cents, 1 FROM whole_shares WHERE cents <> 0
    UNION ALL
    SELECT category_id, period, cents, cents, 1 FROM whole_rest WHERE cents <> 0
    UNION ALL
    SELECT s.category_id, e.period, r.amount_cents, r.amount_cents, 1
    FROM reimbursements r
    JOIN transaction_splits s ON s.id = r.expense_split_id
    JOIN transactions e ON e.id = s.transaction_id
    UNION ALL
    SELECT r.category_id, b.period, r.amount_cents, r.amount_cents, 1
    FROM reimbursements r JOIN transactions b ON b.id = r.reimbursement_tx_id
    WHERE r.category_id IS NOT NULL
  )`;

/** Lo que falta por devolver de cada gasto compartido, entero o submovimiento, y su mes. */
const PENDING = /* sql */ `
  pending (transaction_id, period, cents) AS (
    SELECT s.transaction_id, t.period, s.pending_cents
    FROM shared_expense_status s JOIN transactions t ON t.id = s.transaction_id
    UNION ALL
    SELECT s.transaction_id, t.period, s.pending_cents
    FROM shared_split_status s JOIN transactions t ON t.id = s.transaction_id
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
      `WITH ${ALLOCATED}, ${WHOLE_SHARES}
       SELECT 't' || t.id AS key, t.id AS tx_id, t.category_id,
              coalesce(t.booked_date, t.op_date) AS date, t.description,
              t.amount_cents - ifnull(a.cents, 0) AS amount_cents, 0 AS reimbursed,
              NULL AS expense_key
       FROM transactions t LEFT JOIN allocated a ON a.tx_id = t.id
       WHERE t.period = ? AND ${NOT_INCOMING_LEG} AND t.amount_cents <> ifnull(a.cents, 0)
       UNION ALL
       SELECT 's' || s.id, t.id, s.category_id, coalesce(t.booked_date, t.op_date),
              s.description, s.amount_cents - ifnull(sa.cents, 0), 0, NULL
       FROM transaction_splits s JOIN transactions t ON t.id = s.transaction_id
       LEFT JOIN split_allocated sa ON sa.split_id = s.id
       WHERE t.period = ? AND ${NOT_INCOMING_LEG} AND s.amount_cents <> ifnull(sa.cents, 0)
       UNION ALL
       SELECT 'r' || w.reimbursement_id || 's' || w.split_id, b.id, w.category_id,
              coalesce(b.booked_date, b.op_date), ${SOURCE_NAME}, w.cents, 1, 's' || w.split_id
       FROM whole_shares w JOIN transactions b ON b.id = w.reimbursement_tx_id
       LEFT JOIN transaction_splits src ON src.id = w.source_split_id
       WHERE w.period = ? AND w.cents <> 0
       UNION ALL
       SELECT 'r' || w.reimbursement_id, b.id, w.category_id, coalesce(b.booked_date, b.op_date),
              ${SOURCE_NAME}, w.cents, 1, 't' || w.expense_id
       FROM whole_rest w JOIN transactions b ON b.id = w.reimbursement_tx_id
       LEFT JOIN transaction_splits src ON src.id = w.source_split_id
       WHERE w.period = ? AND w.cents <> 0
       UNION ALL
       SELECT 'r' || r.id, b.id, s.category_id, coalesce(b.booked_date, b.op_date),
              ${SOURCE_NAME}, r.amount_cents, 1, 's' || s.id
       FROM reimbursements r
       JOIN transaction_splits s ON s.id = r.expense_split_id
       JOIN transactions e ON e.id = s.transaction_id
       JOIN transactions b ON b.id = r.reimbursement_tx_id
       LEFT JOIN transaction_splits src ON src.id = r.reimbursement_split_id
       WHERE e.period = ?
       UNION ALL
       SELECT 'r' || r.id, b.id, r.category_id, coalesce(b.booked_date, b.op_date),
              ${SOURCE_NAME}, r.amount_cents, 1, NULL
       FROM reimbursements r JOIN transactions b ON b.id = r.reimbursement_tx_id
       LEFT JOIN transaction_splits src ON src.id = r.reimbursement_split_id
       WHERE r.category_id IS NOT NULL AND b.period = ?`,
      [period, period, period, period, period, period],
    )
    .map((r) => ({
      key: str(r, 'key'),
      transactionId: num(r, 'tx_id'),
      categoryId: numOrNull(r, 'category_id'),
      date: str(r, 'date'),
      description: str(r, 'description'),
      amountCents: num(r, 'amount_cents'),
      reimbursed: num(r, 'reimbursed') === 1,
      expenseKey: strOrNull(r, 'expense_key'),
    }));

  const pending = db.value(
    `WITH ${PENDING} SELECT coalesce(sum(cents), 0) FROM pending WHERE period = ?`,
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

/**
 * Qué movimientos suman en cada total del resumen: el tipo de la categoría en la que cuentan
 * (las archivadas no salen en el resumen). Lo pendiente se calcula aparte, por gasto compartido.
 */
const SUMMARY_SCOPE: Record<Exclude<SummaryTotal, 'pendiente'>, string> = {
  ingresos: "c.kind = 'ingreso' AND c.archived = 0",
  gastos: "c.kind = 'gasto' AND c.archived = 0",
  ahorro: "c.kind = 'ahorro' AND c.archived = 0",
  balance: 'x.category_id IS NULL OR c.archived = 0',
};

/**
 * Los movimientos que forman un total del resumen del mes, con las mismas reglas que lo suman
 * (ADR-0013, ADR-0019): cada movimiento del mes con algo sin repartir ni dividir, cada
 * movimiento del mes por sus submovimientos, cada Bizum enlazado a un gasto o a un
 * submovimiento del mes (aunque llegue en otro) y cada Bizum del mes repartido a una
 * subcategoría. En lo pendiente, los movimientos del mes con algo compartido (entero o en un
 * submovimiento) a lo que aún le falta algo por devolver. Ids de menor a mayor.
 */
export function summaryTransactionIds(db: SqlDb, period: string, total: SummaryTotal): number[] {
  if (total === 'pendiente') {
    return db
      .rows(
        `WITH ${PENDING}
         SELECT DISTINCT transaction_id AS id FROM pending WHERE period = ? AND cents > 0
         ORDER BY transaction_id`,
        [period],
      )
      .map((r) => num(r, 'id'));
  }
  return db
    .rows(
      `WITH ${ALLOCATED}, ${WHOLE_SHARES},
       counted (tx_id, category_id) AS (
         SELECT t.id, t.category_id
         FROM transactions t LEFT JOIN allocated a ON a.tx_id = t.id
         WHERE t.period = ? AND ${NOT_INCOMING_LEG} AND t.amount_cents <> ifnull(a.cents, 0)
         UNION ALL
         SELECT s.transaction_id, s.category_id
         FROM transaction_splits s JOIN transactions t ON t.id = s.transaction_id
         LEFT JOIN split_allocated sa ON sa.split_id = s.id
         WHERE t.period = ? AND ${NOT_INCOMING_LEG} AND s.amount_cents <> ifnull(sa.cents, 0)
         UNION ALL
         SELECT reimbursement_tx_id, category_id FROM whole_shares
         WHERE period = ? AND cents <> 0
         UNION ALL
         SELECT reimbursement_tx_id, category_id FROM whole_rest
         WHERE period = ? AND cents <> 0
         UNION ALL
         SELECT r.reimbursement_tx_id, s.category_id
         FROM reimbursements r
         JOIN transaction_splits s ON s.id = r.expense_split_id
         JOIN transactions e ON e.id = s.transaction_id
         WHERE e.period = ?
         UNION ALL
         SELECT r.reimbursement_tx_id, r.category_id
         FROM reimbursements r JOIN transactions b ON b.id = r.reimbursement_tx_id
         WHERE r.category_id IS NOT NULL AND b.period = ?
       )
       SELECT DISTINCT x.tx_id AS id FROM counted x LEFT JOIN categories c ON c.id = x.category_id
       WHERE ${SUMMARY_SCOPE[total]}
       ORDER BY x.tx_id`,
      [period, period, period, period, period, period],
    )
    .map((r) => num(r, 'id'));
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
  const splits = splitRows(db, where, bind);
  const refunds = refundRows(db, where, bind);
  const links = linkRows(db, where, bind);
  return db
    .rows(
      `SELECT t.id, t.op_date, coalesce(t.booked_date, t.op_date) AS booked_date,
              t.booked_date IS NOT NULL AND t.booked_date <> t.op_date AS date_changed,
              t.period, t.description, t.original_description, t.note, t.amount_cents,
              a.name AS account_name, t.category_id,
              coalesce(p.name, c.name) AS category_name,
              CASE WHEN p.id IS NULL THEN NULL ELSE c.name END AS subcategory_name,
              CASE WHEN p.id IS NULL THEN c.color ELSE p.color END AS category_color,
              EXISTS (SELECT 1 FROM shared_expenses s WHERE s.transaction_id = t.id) AS shared_whole,
              EXISTS (SELECT 1 FROM transaction_splits s
                      WHERE s.transaction_id = t.id AND s.shared_person_id IS NOT NULL) AS shared_split,
              EXISTS (SELECT 1 FROM reimbursements r WHERE r.reimbursement_tx_id = t.id) AS reimbursement,
              EXISTS (SELECT 1 FROM transfers x
                      WHERE x.outgoing_tx_id = t.id OR x.incoming_tx_id = t.id) AS transfer,
              (SELECT ifnull(sum(r.amount_cents), 0) FROM reimbursements r
               WHERE r.reimbursement_tx_id = t.id AND r.reimbursement_split_id IS NULL)
                AS refunding_cents,
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
      categoryColor: strOrNull(r, 'category_color'),
      shared: num(r, 'shared_whole') === 1 || num(r, 'shared_split') === 1,
      reimbursement: num(r, 'reimbursement') === 1,
      transfer: num(r, 'transfer') === 1,
      installment: strOrNull(r, 'installment'),
      splits: splits.get(num(r, 'id')) ?? [],
      refundingCents: num(r, 'refunding_cents'),
      refunds: refunds.get(num(r, 'id')) ?? [],
      refundable: num(r, 'amount_cents') < 0,
      links: links.get(num(r, 'id')) ?? [],
    }));
}

/**
 * Los movimientos vinculados con los que cumplen `where` (ADR-0022), agrupados por movimiento:
 * los gastos que devuelve un ingreso (entero, desde sus submovimientos o a los del gasto), los
 * ingresos que devuelven un gasto y la otra pata de cada traspaso.
 */
function linkRows(
  db: SqlDb,
  where: string,
  bind: readonly string[],
): Map<number, TransactionLink[]> {
  const byTransaction = new Map<number, TransactionLink[]>();
  const rows = db.rows(
    `WITH refund_pairs (expense_id, income_id, cents) AS (
       SELECT coalesce(r.expense_tx_id, es.transaction_id), r.reimbursement_tx_id,
              sum(r.amount_cents)
       FROM reimbursements r LEFT JOIN transaction_splits es ON es.id = r.expense_split_id
       WHERE r.category_id IS NULL
       GROUP BY 1, 2
     ),
     pairs (tx_id, other_id, kind, cents) AS (
       SELECT expense_id, income_id, 'refundedBy', cents FROM refund_pairs
       UNION ALL
       SELECT income_id, expense_id, 'refunds', cents FROM refund_pairs
       UNION ALL
       SELECT outgoing_tx_id, incoming_tx_id, 'transfer', NULL FROM transfers
       UNION ALL
       SELECT incoming_tx_id, outgoing_tx_id, 'transfer', NULL FROM transfers
     )
     SELECT p.tx_id, p.kind, o.id, coalesce(o.booked_date, o.op_date) AS date, o.description,
            a.name AS account_name, coalesce(p.cents, o.amount_cents) AS amount_cents
     FROM pairs p
     JOIN transactions t ON t.id = p.tx_id
     JOIN transactions o ON o.id = p.other_id
     JOIN accounts a ON a.id = o.account_id
     ${where}
     ORDER BY date, o.id`,
    bind,
  );
  for (const r of rows) {
    const id = num(r, 'tx_id');
    const list = byTransaction.get(id) ?? [];
    list.push({
      kind: str(r, 'kind') as TransactionLinkKind,
      transactionId: num(r, 'id'),
      date: str(r, 'date'),
      description: str(r, 'description'),
      accountName: str(r, 'account_name'),
      amountCents: num(r, 'amount_cents'),
    });
    byTransaction.set(id, list);
  }
  return byTransaction;
}

/** Los ingresos que devuelven los gastos que cumplen `where` (ADR-0021), agrupados por gasto. */
function refundRows(db: SqlDb, where: string, bind: readonly string[]): Map<number, RefundRow[]> {
  const byExpense = new Map<number, RefundRow[]>();
  const rows = db.rows(
    `SELECT r.expense_tx_id, b.id, coalesce(b.booked_date, b.op_date) AS date,
            ${SOURCE_NAME} AS description, r.amount_cents
     FROM reimbursements r
     JOIN transactions t ON t.id = r.expense_tx_id
     JOIN transactions b ON b.id = r.reimbursement_tx_id
     LEFT JOIN transaction_splits src ON src.id = r.reimbursement_split_id
     ${where}
     ORDER BY date, b.id`,
    bind,
  );
  for (const r of rows) {
    const id = num(r, 'expense_tx_id');
    const list = byExpense.get(id) ?? [];
    list.push({
      transactionId: num(r, 'id'),
      date: str(r, 'date'),
      description: str(r, 'description'),
      amountCents: num(r, 'amount_cents'),
    });
    byExpense.set(id, list);
  }
  return byExpense;
}

/** Los submovimientos de los movimientos que cumplen `where`, agrupados por movimiento. */
function splitRows(db: SqlDb, where: string, bind: readonly string[]): Map<number, SplitRow[]> {
  const byTransaction = new Map<number, SplitRow[]>();
  const rows = db.rows(
    `SELECT s.id, s.transaction_id, s.description, s.amount_cents, s.category_id,
            coalesce(p.name, c.name) AS category_name,
            CASE WHEN p.id IS NULL THEN NULL ELSE c.name END AS subcategory_name,
            CASE WHEN p.id IS NULL THEN c.color ELSE p.color END AS category_color,
            s.shared_person_id IS NOT NULL AS shared,
            (SELECT group_concat(e.description, char(31)) FROM reimbursements r
             JOIN transactions e ON e.id = r.expense_tx_id
             WHERE r.reimbursement_split_id = s.id) AS refunds_to
     FROM transaction_splits s
     JOIN transactions t ON t.id = s.transaction_id
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     ${where}
     ORDER BY s.id`,
    bind,
  );
  for (const r of rows) {
    const id = num(r, 'transaction_id');
    const list = byTransaction.get(id) ?? [];
    list.push({
      id: num(r, 'id'),
      description: str(r, 'description'),
      amountCents: num(r, 'amount_cents'),
      categoryId: numOrNull(r, 'category_id'),
      categoryName: strOrNull(r, 'category_name'),
      subcategoryName: strOrNull(r, 'subcategory_name'),
      categoryColor: strOrNull(r, 'category_color'),
      shared: num(r, 'shared') === 1,
      refundsTo: strOrNull(r, 'refunds_to')?.split('\u001f') ?? [],
    });
    byTransaction.set(id, list);
  }
  return byTransaction;
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
