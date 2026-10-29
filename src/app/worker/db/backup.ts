import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { BackupError, checkDatabaseFile } from '@domain/backup/database-file';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { wrapDatabase, type SqlDb } from './sql-db';

/** Bytes de la cabecera con la versión del formato: 1 = diario clásico, 2 = WAL. */
const FORMAT_VERSION_OFFSETS = [18, 19] as const;

const SCHEMA_SQL = `
  SELECT type, name, tbl_name, sql FROM sqlite_schema
  WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'
  ORDER BY type, name`;

/** El contenido de la BD como fichero de SQLite (T2.12). */
export function exportDatabase(sqlite3: Sqlite3Static, raw: Database): Uint8Array<ArrayBuffer> {
  return sqlite3.capi.sqlite3_js_db_export(raw);
}

/**
 * Abre un fichero `.db` externo (T2.11) en una BD en memoria **aislada** y solo la devuelve si
 * supera todas las comprobaciones: cabecera y tamaño, integridad, versión, migraciones, esquema
 * idéntico al de la app y claves ajenas. Si algo falla lanza un `BackupError` y no queda nada
 * abierto. El fichero es entrada no confiable.
 */
export function openDatabaseFile(sqlite3: Sqlite3Static, bytes: Uint8Array): Database {
  checkDatabaseFile(bytes);

  const raw = new sqlite3.oo1.DB(':memory:');
  try {
    deserialize(sqlite3, raw, bytes);
    const db = wrapDatabase(raw);
    // Las vistas y triggers de un fichero ajeno no pueden llamar a funciones con efectos.
    db.run('PRAGMA trusted_schema = OFF');
    db.run('PRAGMA foreign_keys = ON');

    if (Number(db.value('PRAGMA user_version')) > MIGRATIONS.length) {
      throw new BackupError('version-futura');
    }
    if (db.value('PRAGMA integrity_check(1)') !== 'ok') throw new BackupError('fichero-danado');

    try {
      migrate(db, MIGRATIONS);
    } catch {
      throw new BackupError('esquema-ajeno');
    }
    if (schemaOf(db) !== expectedSchema(sqlite3) || Number(db.value(META_ROWS_SQL)) !== 1) {
      throw new BackupError('esquema-ajeno');
    }
    if (db.rows('PRAGMA foreign_key_check').length > 0) throw new BackupError('fichero-danado');
    return raw;
  } catch (error) {
    raw.close();
    // Lo que SQLite no consigue leer es un fichero dañado o truncado.
    throw error instanceof BackupError ? error : new BackupError('fichero-danado');
  }
}

const META_ROWS_SQL = 'SELECT count(*) FROM meta';

/** Carga los bytes como contenido de `raw`; la memoria pasa a ser de SQLite, que la libera. */
function deserialize(sqlite3: Sqlite3Static, raw: Database, bytes: Uint8Array): void {
  // Copia creada aquí: SQLite solo acepta arrays de su propio contexto, no los llegados de otro.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  // Una BD en memoria no puede estar en modo WAL: se marca como de diario clásico.
  for (const offset of FORMAT_VERSION_OFFSETS) copy[offset] = 1;

  const { capi, wasm } = sqlite3;
  const pointer = wasm.allocFromTypedArray(copy);
  raw.checkRc(
    capi.sqlite3_deserialize(
      raw,
      'main',
      pointer,
      copy.length,
      copy.length,
      capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
    ),
  );
}

function schemaOf(db: SqlDb): string {
  return JSON.stringify(db.rows(SCHEMA_SQL));
}

/** El esquema que dejan las migraciones en una BD nueva: el único que admite la app. */
function expectedSchema(sqlite3: Sqlite3Static): string {
  const raw = new sqlite3.oo1.DB(':memory:');
  try {
    const db = wrapDatabase(raw);
    migrate(db, MIGRATIONS);
    return schemaOf(db);
  } finally {
    raw.close();
  }
}
