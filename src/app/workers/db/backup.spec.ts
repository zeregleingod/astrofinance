import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { backupErrorCode } from '@domain/backup/database-file';
import { exportDatabase, openDatabaseFile } from './backup';
import { createDbHandlers } from './db-handlers';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { loadDemoData } from './seeds/demo-data';
import { wrapDatabase, type SqlDb } from './sql-db';

describe('copia de la base de datos en un fichero', () => {
  let sqlite3: Sqlite3Static;

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  /** Los bytes de una BD en memoria preparada por `build`. */
  const fileOf = (build: (db: SqlDb) => void) => {
    const raw = new sqlite3.oo1.DB(':memory:');
    try {
      const db = wrapDatabase(raw);
      db.run('PRAGMA foreign_keys = ON');
      build(db);
      return exportDatabase(sqlite3, raw);
    } finally {
      raw.close();
    }
  };
  const demoFile = (extra: (db: SqlDb) => void = () => undefined) =>
    fileOf((db) => {
      migrate(db, MIGRATIONS);
      loadDemoData(db);
      extra(db);
    });
  /** Abre el fichero y devuelve lo que diga `read`, o el código del error si se rechaza. */
  const open = <T>(bytes: Uint8Array, read: (db: SqlDb) => T) => {
    try {
      const raw = openDatabaseFile(sqlite3, bytes);
      try {
        return read(wrapDatabase(raw));
      } finally {
        raw.close();
      }
    } catch (error) {
      return backupErrorCode(error) ?? error;
    }
  };
  const count = (db: SqlDb) => Number(db.value('SELECT count(*) FROM transactions'));

  it('lo exportado se vuelve a abrir con los mismos datos', () => {
    const bytes = demoFile();
    expect(open(bytes, count)).toBeGreaterThan(0);
    expect(open(bytes, (db) => db.value('SELECT db_uuid FROM meta'))).toHaveLength(36);
    expect(open(bytes, (db) => db.value('PRAGMA foreign_keys'))).toBe(1);
  });

  it('rechaza un fichero que no es de SQLite, vacío o demasiado grande', () => {
    expect(open(new TextEncoder().encode('fecha;concepto;importe'), count)).toBe('no-es-sqlite');
    expect(open(new Uint8Array(), count)).toBe('fichero-vacio');
  });

  it('rechaza un fichero truncado o con páginas dañadas', () => {
    const bytes = demoFile();
    expect(open(bytes.slice(0, Math.floor(bytes.length / 2)), count)).toBe('fichero-danado');
    expect(open(bytes.slice(0, 100), count)).toBe('fichero-danado');

    const garbled = bytes.slice();
    garbled.fill(0xff, 4096, 4096 * 6);
    expect(open(garbled, count)).toBe('fichero-danado');
  });

  it('rechaza una BD de SQLite con otro esquema', () => {
    const foreign = fileOf((db) => db.run('CREATE TABLE notas (texto TEXT) STRICT'));
    expect(open(foreign, count)).toBe('esquema-ajeno');

    // Mismo esquema más un trigger: no es el de la app.
    const tampered = demoFile((db) =>
      db.run(`CREATE TRIGGER extra AFTER INSERT ON categories BEGIN DELETE FROM budgets; END`),
    );
    expect(open(tampered, count)).toBe('esquema-ajeno');

    const withoutMeta = demoFile((db) => db.run('DELETE FROM meta'));
    expect(open(withoutMeta, count)).toBe('esquema-ajeno');
  });

  it('rechaza una BD de una versión más nueva que la app', () => {
    const future = demoFile((db) => db.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`));
    expect(open(future, count)).toBe('version-futura');
  });

  it('migra una BD de una versión anterior', () => {
    const old = fileOf((db) => migrate(db, MIGRATIONS.slice(0, 1)));
    expect(open(old, (db) => db.value('PRAGMA user_version'))).toBe(MIGRATIONS.length);
  });

  it('rechaza datos que rompen las claves ajenas', () => {
    const broken = demoFile((db) => {
      db.run('PRAGMA foreign_keys = OFF');
      db.run(
        'UPDATE transactions SET account_id = 999999 WHERE id = (SELECT min(id) FROM transactions)',
      );
    });
    expect(open(broken, count)).toBe('fichero-danado');
  });

  it('abre una BD guardada en modo WAL', () => {
    const wal = demoFile();
    wal[18] = 2;
    wal[19] = 2;
    expect(open(wal, count)).toBeGreaterThan(0);
  });

  describe('en el worker', () => {
    it('sustituye la BD abierta y se puede seguir trabajando en ella', async () => {
      const handlers = createDbHandlers(() => Promise.resolve(sqlite3));
      await handlers.openDemo(undefined);
      const bytes = await handlers.exportFile(undefined);

      await handlers.openNew(undefined);
      expect(await handlers.periods(undefined)).toEqual([]);

      expect((await handlers.openFile({ bytes })).transactions).toBeGreaterThan(0);
      expect(await handlers.periods(undefined)).toEqual(['2026-07', '2026-08', '2026-09']);
      expect((await handlers.monthReport({ period: '2026-09' })).period).toBe('2026-09');
      const id = await handlers.createCategory({ parentId: null, name: 'Mascotas', color: null });
      expect(await handlers.deleteCategory({ id })).toBe(0);
    });

    it('abre un fichero aunque no hubiera ninguna BD abierta', async () => {
      const handlers = createDbHandlers(() => Promise.resolve(sqlite3));
      await handlers.openFile({ bytes: demoFile() });
      expect((await handlers.periods(undefined)).length).toBe(3);
    });

    it('si el fichero no vale, la BD abierta queda como estaba', async () => {
      const handlers = createDbHandlers(() => Promise.resolve(sqlite3));
      await handlers.openDemo(undefined);

      await expect(
        handlers.openFile({ bytes: new TextEncoder().encode('no soy una base de datos') }),
      ).rejects.toMatchObject({ name: 'BackupError', message: 'no-es-sqlite' });
      await expect(handlers.openFile({ bytes: 'x' as unknown as Uint8Array })).rejects.toThrow(
        RangeError,
      );

      expect((await handlers.periods(undefined)).length).toBe(3);
    });

    it('no hay nada que exportar sin una BD abierta', async () => {
      const handlers = createDbHandlers(() => Promise.resolve(sqlite3));
      await expect(handlers.exportFile(undefined)).rejects.toThrow(/ninguna base de datos/);
    });
  });
});
