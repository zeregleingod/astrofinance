import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 006: categoría sugerida por el historial', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const insertTransaction = (source: string, categoryId: number | null, ruleId: number | null) =>
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
         category_source, rule_id, origin)
       VALUES (1, '2026-02-01', -500, 'Otra', ?, ?, ?, 'manual')`,
      [categoryId, source, ruleId],
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    // Una BD anterior: un movimiento importado y clasificado por una regla, y otro con traspaso.
    migrate(db, MIGRATIONS.slice(0, 5));
    db.run(`INSERT INTO categories (id, name) VALUES (1, 'Variables')`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (2, 1, 'Comida', 'gasto')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (2, 'Hucha', 'ahorro')`);
    db.run(
      `INSERT INTO rules (id, name, priority, operator, pattern, category_id)
       VALUES (5, 'Súper', 1, 'contiene', 'SUPER', 2)`,
    );
    db.run(
      `INSERT INTO import_batches (id, account_id, bank_profile, file_name, file_sha256,
         date_from, date_to, rows_total, rows_new, rows_duplicate, rows_error)
       VALUES (1, 1, 'sabadell', 'enero.xls', ?, '2026-01-01', '2026-01-31', 1, 1, 0, 0)`,
      ['a'.repeat(64)],
    );
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, booked_date, amount_cents, description,
         original_description, category_id, category_source, rule_id, origin, import_batch_id,
         dedupe_hash)
       VALUES (10, 1, '2026-01-05', '2026-02-01', -1000, 'Súper', 'SUPER DEMO', 2, 'regla', 5,
         'importado', 1, ?)`,
      ['b'.repeat(64)],
    );
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, origin)
       VALUES (11, 2, '2026-01-05', 1000, 'Traspaso', 'manual')`,
    );
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (10, 11)');
  });

  afterEach(() => raw.close());

  it('conserva los movimientos, sus columnas calculadas y lo que cuelga de ellos', () => {
    expect(migrate(db, MIGRATIONS)).toMatchObject({ from: 5 });

    expect(
      db.rows(
        `SELECT id, period, description, original_description, category_source, rule_id,
                import_batch_id, dedupe_hash
         FROM transactions ORDER BY id`,
      ),
    ).toEqual([
      {
        id: 10,
        period: '2026-02',
        description: 'Súper',
        original_description: 'SUPER DEMO',
        category_source: 'regla',
        rule_id: 5,
        import_batch_id: 1,
        dedupe_hash: 'b'.repeat(64),
      },
      {
        id: 11,
        period: '2026-01',
        description: 'Traspaso',
        original_description: null,
        category_source: 'ninguna',
        rule_id: null,
        import_batch_id: null,
        dedupe_hash: null,
      },
    ]);
    expect(db.rows('PRAGMA foreign_key_check')).toEqual([]);

    // Las claves ajenas siguen apuntando a la tabla nueva.
    db.run('DELETE FROM transactions WHERE id = 11');
    expect(db.value('SELECT count(*) FROM transfers')).toBe(0);
    db.run('DELETE FROM rules WHERE id = 5');
    expect(db.value('SELECT rule_id FROM transactions WHERE id = 10')).toBeNull();
  });

  it('admite el origen «sugerencia», siempre con categoría y sin regla', () => {
    migrate(db, MIGRATIONS);

    insertTransaction('sugerencia', 2, null);
    expect(db.value(`SELECT count(*) FROM transactions WHERE category_source = 'sugerencia'`)).toBe(
      1,
    );
    expect(() => insertTransaction('sugerencia', null, null)).toThrow(/CHECK constraint failed/);
    expect(() => insertTransaction('sugerencia', 2, 5)).toThrow(/CHECK constraint failed/);
    expect(() => insertTransaction('adivinada', 2, null)).toThrow(/CHECK constraint failed/);
  });

  it('mantiene los índices y la protección del concepto original', () => {
    migrate(db, MIGRATIONS);

    const indexes = db
      .rows(`SELECT name FROM sqlite_schema WHERE type = 'index' AND tbl_name = 'transactions'`)
      .map((row) => row['name']);
    expect(indexes).toEqual(
      expect.arrayContaining([
        'ix_transactions_account_date',
        'ix_transactions_period',
        'ix_transactions_category',
        'ix_transactions_batch',
      ]),
    );
    expect(() =>
      db.run(`UPDATE transactions SET original_description = 'OTRO' WHERE id = 10`),
    ).toThrow(/concepto original/);
    // Los disparadores de otras tablas que leen movimientos siguen funcionando.
    expect(() =>
      db.run(
        'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (11, 1, 1)',
      ),
    ).toThrow();
  });
});
