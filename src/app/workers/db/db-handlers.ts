import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { isPeriod } from '@domain/dates/period';
import type { RpcHandlers } from '../rpc/protocol';
import type { DbApi } from './db-api';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import { listPeriods, monthReport, monthTransactions } from './queries/reports';
import { loadDemoData } from './seeds/demo-data';
import { wrapDatabase, type SqlDb } from './sql-db';

/** Implementación del contrato `DbApi`. SQLite se carga la primera vez que hace falta. */
export function createDbHandlers(loadSqlite: () => Promise<Sqlite3Static>): RpcHandlers<DbApi> {
  let sqlite: Promise<Sqlite3Static> | undefined;
  let current: { raw: Database; db: SqlDb } | undefined;

  const close = (): undefined => {
    current?.raw.close();
    current = undefined;
    return undefined;
  };

  const requireDb = () => {
    if (!current) throw new Error('No hay ninguna base de datos abierta.');
    return current.db;
  };

  return {
    async openDemo() {
      sqlite ??= loadSqlite();
      const sqlite3 = await sqlite;
      close();
      const raw = new sqlite3.oo1.DB(':memory:');
      const db = wrapDatabase(raw);
      db.run('PRAGMA foreign_keys = ON');
      migrate(db, MIGRATIONS);
      loadDemoData(db);
      current = { raw, db };
    },
    close,
    periods: () => listPeriods(requireDb()),
    monthReport: (params) => monthReport(requireDb(), periodParam(params)),
    transactions: (params) => monthTransactions(requireDb(), periodParam(params)),
  };
}

function periodParam(params: unknown): string {
  const period: unknown =
    typeof params === 'object' && params !== null
      ? (params as { period?: unknown }).period
      : undefined;
  if (!isPeriod(period)) throw new RangeError('Periodo no válido (AAAA-MM).');
  return period;
}
