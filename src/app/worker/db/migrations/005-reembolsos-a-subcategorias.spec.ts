import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 005: reembolsos repartidos a subcategorías', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const tx = (amount: number, category: number | null = null) => {
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
         category_source, origin)
       VALUES (1, '2026-06-05', ?, 'Movimiento', ?, ?, 'manual')`,
      [amount, category, category === null ? 'ninguna' : 'manual'],
    );
    return Number(db.value('SELECT last_insert_rowid()'));
  };
  const toExpense = (bizum: number, expense: number, cents: number) =>
    db.run(
      'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
      [expense, bizum, cents],
    );
  const toCategory = (bizum: number, category: number, cents: number) =>
    db.run(
      'INSERT INTO reimbursements (category_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
      [category, bizum, cents],
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    // Una BD anterior a la migración con un gasto compartido ya reembolsado.
    migrate(db, MIGRATIONS.slice(0, 4));
    db.run(`INSERT INTO categories (id, name) VALUES (1, 'Variables')`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (2, 1, 'Comida', 'gasto')`);
    db.run(`INSERT INTO categories (id, name) VALUES (3, 'Ingresos')`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (4, 3, 'Nómina', 'ingreso')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(`INSERT INTO people (id, name) VALUES (1, 'Sergio')`);
    db.run(`INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
              category_source, origin)
            VALUES (10, 1, '2026-06-05', -11192, 'Cetelem', 'ninguna', 'manual'),
                   (11, 1, '2026-06-06', 5596, 'Bizum Sergio', 'ninguna', 'manual')`);
    db.run(`INSERT INTO shared_expenses (transaction_id, person_id, expected_cents)
            VALUES (10, 1, 5596)`);
    db.run(`INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents)
            VALUES (10, 11, 5596)`);
  });

  afterEach(() => raw.close());

  it('conserva los reembolsos enlazados a un gasto y lo pendiente de cobrar', () => {
    expect(migrate(db, MIGRATIONS)).toMatchObject({ from: 4 });

    expect(
      db.rows(
        'SELECT expense_tx_id, category_id, reimbursement_tx_id, amount_cents FROM reimbursements',
      ),
    ).toEqual([
      { expense_tx_id: 10, category_id: null, reimbursement_tx_id: 11, amount_cents: 5596 },
    ]);
    expect(db.rows('SELECT reimbursed_cents, pending_cents FROM shared_expense_status')).toEqual([
      { reimbursed_cents: 5596, pending_cents: 0 },
    ]);
    expect(db.rows('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.value('PRAGMA foreign_keys')).toBe(1);
  });

  it('reparte un Bizum entre gastos y subcategorías de gasto sin pasar de lo recibido', () => {
    migrate(db, MIGRATIONS);
    const bizum = tx(12000);
    const expense = tx(-5000);
    db.run(
      'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (?, 1, 2500)',
      [expense],
    );

    toExpense(bizum, expense, 2500);
    toCategory(bizum, 2, 9000);
    expect(() => toCategory(bizum, 2, 100)).toThrow(/UNIQUE/i);
    expect(() =>
      db.run('UPDATE reimbursements SET amount_cents = 9600 WHERE category_id = 2'),
    ).toThrow(/más de lo recibido/);
    db.run('UPDATE reimbursements SET amount_cents = 9500 WHERE category_id = 2');
  });

  it('lo repartido a subcategorías no cuenta como devuelto de ningún gasto', () => {
    migrate(db, MIGRATIONS);
    toCategory(tx(4000), 2, 4000);
    expect(db.rows('SELECT reimbursed_cents, pending_cents FROM shared_expense_status')).toEqual([
      { reimbursed_cents: 5596, pending_cents: 0 },
    ]);
  });

  it('cada parte va a un gasto o a una subcategoría de gasto, nunca a las dos ni a ninguna', () => {
    migrate(db, MIGRATIONS);
    const bizum = tx(4000);

    expect(() =>
      db.run(
        `INSERT INTO reimbursements (expense_tx_id, category_id, reimbursement_tx_id, amount_cents)
         VALUES (10, 2, ?, 100)`,
        [bizum],
      ),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.run('INSERT INTO reimbursements (reimbursement_tx_id, amount_cents) VALUES (?, 100)', [
        bizum,
      ]),
    ).toThrow(/CHECK/i);
    expect(() => toCategory(bizum, 4, 100)).toThrow(/subcategoría de gasto/);
    expect(() => toCategory(bizum, 1, 100)).toThrow(/subcategoría de gasto/);
    expect(() => toCategory(tx(-100), 2, 100)).toThrow(/debe ser un ingreso/);
  });

  it('al borrar la subcategoría o el Bizum se van sus repartos', () => {
    migrate(db, MIGRATIONS);
    const bizum = tx(4000);
    toCategory(bizum, 2, 1500);

    db.run('DELETE FROM categories WHERE id = 2');
    expect(db.value('SELECT count(*) FROM reimbursements WHERE category_id IS NOT NULL')).toBe(0);

    db.run('DELETE FROM transactions WHERE id = 11');
    expect(db.value('SELECT count(*) FROM reimbursements')).toBe(0);
    expect(db.rows('SELECT pending_cents FROM shared_expense_status')).toEqual([
      { pending_cents: 5596 },
    ]);
  });
});
