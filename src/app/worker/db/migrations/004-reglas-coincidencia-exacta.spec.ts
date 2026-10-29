import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 004: reglas con coincidencia exacta', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const insertRule = (operator: string) =>
    db.run(
      `INSERT INTO rules (name, priority, operator, pattern, category_id)
       VALUES ('Regla', 99, ?, 'texto', 2)`,
      [operator],
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    // Datos de una BD anterior a la migración: una regla que ya ha clasificado un movimiento.
    migrate(db, MIGRATIONS.slice(0, 3));
    db.run(`INSERT INTO categories (id, name) VALUES (1, 'Variables')`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (2, 1, 'Comida', 'gasto')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(
      `INSERT INTO rules (id, name, priority, operator, pattern, sign, category_id)
       VALUES (5, 'Súper', 10, 'contiene', 'Supermercado', 'gasto', 2)`,
    );
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
         category_source, rule_id, origin)
       VALUES (1, '2026-01-05', -1000, 'Supermercado', 2, 'regla', 5, 'manual')`,
    );
  });

  afterEach(() => raw.close());

  it('conserva las reglas y lo que habían clasificado', () => {
    expect(migrate(db, MIGRATIONS)).toMatchObject({ from: 3 });

    expect(
      db.rows('SELECT id, name, priority, enabled, operator, pattern, sign FROM rules'),
    ).toEqual([
      {
        id: 5,
        name: 'Súper',
        priority: 10,
        enabled: 1,
        operator: 'contiene',
        pattern: 'Supermercado',
        sign: 'gasto',
      },
    ]);
    expect(db.value('SELECT rule_id FROM transactions')).toBe(5);
    expect(db.rows('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.value('PRAGMA foreign_keys')).toBe(1);
  });

  it('admite el operador «exacto» y sigue rechazando los desconocidos', () => {
    expect(() => insertRule('exacto')).toThrow(/CHECK/i);
    migrate(db, MIGRATIONS);

    insertRule('exacto');
    expect(() => insertRule('parecido')).toThrow(/CHECK/i);
  });

  it('borrar una regla sigue soltando sus movimientos', () => {
    migrate(db, MIGRATIONS);

    db.run('DELETE FROM rules WHERE id = 5');
    expect(db.rows('SELECT rule_id, category_id, category_source FROM transactions')).toEqual([
      { rule_id: null, category_id: 2, category_source: 'regla' },
    ]);
  });
});
