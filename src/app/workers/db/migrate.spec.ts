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

  it('rechaza listas de migraciones desordenadas o con huecos', () => {
    expect(() => migrate(db, [m2, m1])).toThrow(MigrationError);
    expect(() => migrate(db, [m2])).toThrow(MigrationError);
  });
});
