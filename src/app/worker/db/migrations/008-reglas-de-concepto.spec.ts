import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 008: reglas de concepto', () => {
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
    migrate(db, MIGRATIONS.slice(0, 7));
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(
      `INSERT INTO import_batches (id, account_id, bank_profile, file_name, file_sha256,
         date_from, date_to, rows_total, rows_new, rows_duplicate, rows_error)
       VALUES (1, 1, 'sabadell', 'enero.xls', ?, '2026-01-01', '2026-01-31', 2, 2, 0, 0)`,
      ['a'.repeat(64)],
    );
    const imported = (id: number, description: string) =>
      db.run(
        `INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
           original_description, origin, import_batch_id, dedupe_hash)
         VALUES (?, 1, '2026-01-05', -100, ?, 'COMPRA AMAZON', 'importado', 1, ?)`,
        [id, description, String(id).repeat(64).slice(0, 64)],
      );
    imported(1, 'COMPRA AMAZON');
    imported(2, 'Amazon');
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, origin)
       VALUES (3, 1, '2026-01-06', -100, 'A mano', 'manual')`,
    );
  });

  afterEach(() => raw.close());

  it('da por escritos a mano los conceptos que no son el del banco', () => {
    migrate(db, MIGRATIONS);
    expect(db.rows('SELECT id, description_source FROM transactions ORDER BY id')).toEqual([
      { id: 1, description_source: 'banco' },
      { id: 2, description_source: 'manual' },
      { id: 3, description_source: 'manual' },
    ]);
  });

  it('solo admite operadores, alcances y orígenes conocidos', () => {
    migrate(db, MIGRATIONS);
    const insert = (operator: string, scope: string) =>
      db.run(
        `INSERT INTO concept_rules (priority, operator, pattern, scope, replacement)
         VALUES (1, ?, 'X', ?, '')`,
        [operator, scope],
      );
    expect(() => insert('contiene', 'coincidencia')).not.toThrow();
    expect(() => insert('empieza', 'coincidencia')).toThrow();
    expect(() => insert('regex', 'todo')).toThrow();
    expect(() => db.run(`UPDATE transactions SET description_source = 'otra'`)).toThrow();
  });
});
