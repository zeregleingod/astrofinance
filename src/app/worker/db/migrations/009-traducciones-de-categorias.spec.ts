import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 009: traducciones de categorías', () => {
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
    migrate(db, MIGRATIONS.slice(0, 8));
    db.run(`INSERT INTO categories (id, name, color) VALUES (1, 'Variables', '#000000')`);
    migrate(db, MIGRATIONS);
  });

  afterEach(() => raw.close());

  it('conserva las categorías, que empiezan sin traducciones', () => {
    expect(db.value('SELECT name FROM categories WHERE id = 1')).toBe('Variables');
    expect(db.value('SELECT count(*) FROM category_translations')).toBe(0);
  });

  it('guarda un nombre por idioma, que se va con su categoría', () => {
    db.run(`INSERT INTO category_translations VALUES (1, 'en', 'Variable costs')`);
    expect(() => db.run(`INSERT INTO category_translations VALUES (1, 'en', 'Otra')`)).toThrow();

    db.run('DELETE FROM categories WHERE id = 1');

    expect(db.value('SELECT count(*) FROM category_translations')).toBe(0);
  });

  it('rechaza idiomas que no son un código de dos letras y nombres vacíos o largos', () => {
    const insert = (language: string, name: string) => () =>
      db.run('INSERT INTO category_translations VALUES (1, ?, ?)', [language, name]);

    expect(insert('EN', 'Food')).toThrow();
    expect(insert('eng', 'Food')).toThrow();
    expect(insert('en', '  ')).toThrow();
    expect(insert('en', 'x'.repeat(61))).toThrow();
  });
});
