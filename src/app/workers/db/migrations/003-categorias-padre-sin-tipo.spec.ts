import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 003: categorías principales sin tipo', () => {
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
    // Datos de una BD anterior a la migración: el tipo estaba también en la principal.
    migrate(db, MIGRATIONS.slice(0, 2));
    db.run(
      `INSERT INTO categories (id, name, kind, color) VALUES (1, 'Variables', 'gasto', '#9C3A00')`,
    );
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (2, 1, 'Comida', 'gasto')`);
    db.run(`INSERT INTO categories (id, name, kind) VALUES (3, 'Ahorro', 'neutra')`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (4, 3, 'Hucha', 'neutra')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
         category_source, origin)
       VALUES (1, '2026-01-05', -1000, 'Compra', 2, 'manual', 'manual')`,
    );
    db.run(`INSERT INTO budgets (category_id, period, amount_cents) VALUES (2, '2026-01', 5000)`);
  });

  afterEach(() => raw.close());

  it('quita el tipo a las principales y conserva todo lo demás', () => {
    expect(migrate(db, MIGRATIONS)).toMatchObject({ from: 2 });

    expect(db.rows('SELECT id, parent_id, name, kind, color FROM categories ORDER BY id')).toEqual([
      { id: 1, parent_id: null, name: 'Variables', kind: null, color: '#9C3A00' },
      { id: 2, parent_id: 1, name: 'Comida', kind: 'gasto', color: null },
      { id: 3, parent_id: null, name: 'Ahorro', kind: null, color: null },
      { id: 4, parent_id: 3, name: 'Hucha', kind: 'ahorro', color: null },
    ]);
    expect(db.value('SELECT category_id FROM transactions')).toBe(2);
    expect(db.value('SELECT count(*) FROM budgets')).toBe(1);
  });

  it('las claves ajenas siguen activas y apuntando a la tabla nueva', () => {
    migrate(db, MIGRATIONS);

    expect(db.value('PRAGMA foreign_keys')).toBe(1);
    expect(db.rows('PRAGMA foreign_key_check')).toEqual([]);
    expect(() => db.run('DELETE FROM categories WHERE id = 2')).toThrow(/FOREIGN KEY/i);
    expect(() => db.run('DELETE FROM categories WHERE id = 1')).toThrow(/FOREIGN KEY/i);
    expect(() =>
      db.run(
        `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
           category_source, origin)
         VALUES (1, '2026-01-06', -500, 'Otra', 999, 'manual', 'manual')`,
      ),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('una subcategoría necesita tipo; una principal no', () => {
    migrate(db, MIGRATIONS);

    db.run(`INSERT INTO categories (name) VALUES ('Suministros')`);
    expect(() => db.run(`INSERT INTO categories (parent_id, name) VALUES (1, 'Ocio')`)).toThrow(
      /CHECK/i,
    );
    expect(() =>
      db.run(`INSERT INTO categories (parent_id, name, kind) VALUES (1, 'Ocio', 'otro')`),
    ).toThrow(/CHECK/i);
    // El tipo `neutra` ya no existe: ahora es `ahorro`.
    expect(() =>
      db.run(`INSERT INTO categories (parent_id, name, kind) VALUES (1, 'Ocio', 'neutra')`),
    ).toThrow(/CHECK/i);
    db.run(`INSERT INTO categories (parent_id, name, kind) VALUES (1, 'Hucha', 'ahorro')`);
    // El nombre sigue sin poder repetirse entre hermanas.
    expect(() =>
      db.run(`INSERT INTO categories (parent_id, name, kind) VALUES (1, 'comida', 'gasto')`),
    ).toThrow(/UNIQUE/i);
  });
});
