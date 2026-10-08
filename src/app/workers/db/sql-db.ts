import type { Database } from '@sqlite.org/sqlite-wasm';

export type SqlValue = string | number | null;
export type SqlRow = Readonly<Record<string, unknown>>;

/** Acceso mínimo a SQLite usado por migraciones, semillas y consultas. Siempre parametrizado. */
export interface SqlDb {
  run(sql: string, bind?: readonly SqlValue[]): void;
  rows(sql: string, bind?: readonly SqlValue[]): SqlRow[];
  value(sql: string, bind?: readonly SqlValue[]): unknown;
  lastInsertId(): number;
  transaction<T>(fn: () => T): T;
}

export function wrapDatabase(db: Database): SqlDb {
  // sqlite-wasm rechaza un `bind` vacío en sentencias sin parámetros.
  const params = (bind: readonly SqlValue[]) => (bind.length > 0 ? [...bind] : undefined);
  return {
    run: (sql, bind = []) => {
      db.exec({ sql, bind: params(bind) });
    },
    rows: (sql, bind = []) => db.selectObjects(sql, params(bind)),
    value: (sql, bind = []) => db.selectValue(sql, params(bind)),
    lastInsertId: () => Number(db.selectValue('SELECT last_insert_rowid()')),
    transaction: (fn) => db.transaction(() => fn()),
  };
}
