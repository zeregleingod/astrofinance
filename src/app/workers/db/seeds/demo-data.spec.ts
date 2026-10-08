import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { CATEGORY_TEMPLATE } from './category-template';
import { DEMO_EXTRA_CATEGORIES, DEMO_PERIODS, loadDemoData } from './demo-data';

describe('datos de demo', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    loadDemoData(db);
  });

  afterEach(() => raw.close());

  const values = (sql: string) => db.rows(sql).map((r) => Object.values(r)[0]);

  it('deja la BD íntegra', () => {
    expect(db.value('PRAGMA integrity_check')).toBe('ok');
    expect(db.rows('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('reparte los movimientos en los meses de la demo', () => {
    expect(values('SELECT DISTINCT period FROM transactions ORDER BY period')).toEqual([
      ...DEMO_PERIODS,
    ]);
  });

  it('tiene movimientos en todos los bloques de la plantilla', () => {
    const groups = values(`
      SELECT DISTINCT coalesce(p.name, c.name) FROM transactions t
      JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY 1`);
    expect(groups).toEqual(CATEGORY_TEMPLATE.map((g) => g.name).sort());
  });

  it('añade categorías propias de la demo que la plantilla no tiene', () => {
    const templateNames = CATEGORY_TEMPLATE.flatMap((g) => g.children.map(([name]) => name));
    for (const [, name] of DEMO_EXTRA_CATEGORIES) {
      expect(templateNames).not.toContain(name);
      expect(
        db.value(
          'SELECT count(*) FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.name = ?',
          [name],
        ),
      ).toBeGreaterThan(0);
    }
  });

  it('cubre todas las tablas del modelo', () => {
    for (const table of [
      'accounts',
      'people',
      'rules',
      'transfers',
      'shared_expenses',
      'reimbursements',
      'loans',
      'loan_installments',
      'recurring_series',
      'recurring_occurrences',
      'budgets',
    ]) {
      expect(Number(db.value(`SELECT count(*) FROM ${table}`)), table).toBeGreaterThan(0);
    }
  });

  it('deja pendiente de cobrar el seguro del hogar de agosto y la compra de septiembre', () => {
    expect(db.value('SELECT sum(pending_cents) FROM shared_expense_status')).toBe(9210 + 3929);
  });

  it('imputa a septiembre los reembolsos que llegan en octubre', () => {
    expect(
      db.rows(
        `SELECT op_date, period FROM transactions WHERE op_date >= '2026-10-01' ORDER BY op_date`,
      ),
    ).toEqual([
      { op_date: '2026-10-02', period: '2026-09' },
      { op_date: '2026-10-03', period: '2026-09' },
    ]);
  });

  it('termina la financiación de la cocina en septiembre (10/10)', () => {
    expect(
      db.value(`
        SELECT t.op_date FROM loan_installments i
        JOIN loans l ON l.id = i.loan_id JOIN transactions t ON t.id = i.transaction_id
        WHERE l.name = 'Muebles de cocina' AND i.number = l.installments_total`),
    ).toBe('2026-09-02');
  });

  it('es anónima: ningún dato real del Excel', () => {
    const texts = values(`
      SELECT description FROM transactions UNION ALL SELECT name FROM accounts
      UNION ALL SELECT name FROM people UNION ALL SELECT ifnull(lender, '') FROM loans`).join('\n');
    for (const real of [
      'Sergio',
      'Onieva',
      'Sabadell',
      'Caixa',
      'Cetelem',
      'N26',
      'Goin',
      'Ikea',
    ]) {
      expect(texts).not.toContain(real);
    }
  });
});
