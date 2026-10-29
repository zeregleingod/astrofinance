import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate, MigrationError } from './migrate';
import type { Migration } from './migrations/migration';
import { wrapDatabase, type SqlDb } from './sql-db';

describe('migrate', () => {
  let sqlite3: Sqlite3Static;
  let db: SqlDb;
  let close: () => void;

  const m1: Migration = { version: 1, name: 'uno', sql: 'CREATE TABLE a (x INTEGER) STRICT;' };
  const m2: Migration = { version: 2, name: 'dos', sql: 'CREATE TABLE b (y INTEGER) STRICT;' };
  const tables = () =>
    db
      .rows(`SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name`)
      .map((r) => r['name']);

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    const raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    close = () => raw.close();
  });

  afterEach(() => close());

  it('lleva una BD vacía a la última versión', () => {
    expect(migrate(db, [m1, m2])).toEqual({ from: 0, to: 2 });
    expect(db.value('PRAGMA user_version')).toBe(2);
    expect(tables()).toEqual(['a', 'b']);
  });

  it('es idempotente y solo aplica las pendientes', () => {
    migrate(db, [m1]);
    expect(migrate(db, [m1, m2])).toEqual({ from: 1, to: 2 });
    expect(migrate(db, [m1, m2])).toEqual({ from: 2, to: 2 });
  });

  it('rechaza una BD de una versión más nueva que la app', () => {
    db.run('PRAGMA user_version = 3');
    expect(() => migrate(db, [m1, m2])).toThrow(MigrationError);
    expect(tables()).toEqual([]);
  });

  it('deshace una migración que falla a mitad sin tocar la versión', () => {
    const broken: Migration = {
      version: 2,
      name: 'rota',
      sql: 'CREATE TABLE b (y INTEGER) STRICT; INSERT INTO no_existe VALUES (1);',
    };
    migrate(db, [m1]);
    expect(() => migrate(db, [m1, broken])).toThrow(/no_existe/);
    expect(db.value('PRAGMA user_version')).toBe(1);
    expect(tables()).toEqual(['a']);
  });

  describe('migraciones que reconstruyen tablas', () => {
    const parent: Migration = {
      version: 1,
      name: 'padre-e-hija',
      sql: `CREATE TABLE p (id INTEGER PRIMARY KEY, n TEXT NOT NULL) STRICT;
            CREATE TABLE c (id INTEGER PRIMARY KEY, p_id INTEGER NOT NULL REFERENCES p (id)) STRICT;
            INSERT INTO p VALUES (1, 'a'); INSERT INTO c VALUES (1, 1);`,
    };
    const rebuild = (copy: string): Migration => ({
      version: 2,
      name: 'reconstruye-p',
      rebuildsTables: true,
      sql: `CREATE TABLE p_new (id INTEGER PRIMARY KEY, n TEXT) STRICT;
            ${copy}
            DROP TABLE p; ALTER TABLE p_new RENAME TO p;`,
    });

    beforeEach(() => db.run('PRAGMA foreign_keys = ON'));

    it('reconstruye una tabla referenciada y deja las claves ajenas activas', () => {
      migrate(db, [parent, rebuild('INSERT INTO p_new SELECT id, n FROM p;')]);

      expect(db.value('PRAGMA user_version')).toBe(2);
      expect(db.value('PRAGMA foreign_keys')).toBe(1);
      expect(() => db.run('DELETE FROM p')).toThrow(/FOREIGN KEY/i);
      db.run('INSERT INTO p (id) VALUES (2)');
    });

    it('se deshace si deja alguna clave ajena rota', () => {
      migrate(db, [parent]);

      expect(() => migrate(db, [parent, rebuild('')])).toThrow(MigrationError);
      expect(db.value('PRAGMA user_version')).toBe(1);
      expect(db.value('PRAGMA foreign_keys')).toBe(1);
      expect(db.value('SELECT n FROM p')).toBe('a');
    });

    it('no activa las claves ajenas si estaban desactivadas', () => {
      db.run('PRAGMA foreign_keys = OFF');
      migrate(db, [parent, rebuild('INSERT INTO p_new SELECT id, n FROM p;')]);

      expect(db.value('PRAGMA foreign_keys')).toBe(0);
    });
  });

  it('rechaza listas de migraciones desordenadas o con huecos', () => {
    expect(() => migrate(db, [m2, m1])).toThrow(MigrationError);
    expect(() => migrate(db, [m2])).toThrow(MigrationError);
  });
});
