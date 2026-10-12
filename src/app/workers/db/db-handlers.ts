import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { isPeriod } from '@domain/dates/period';
import type { RpcHandlers } from '../rpc/protocol';
import type { DbApi } from './db-api';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import {
  categoryIdParam,
  categoryUpdateParam,
  categoryTree,
  createCategory,
  deleteCategory,
  newCategoryParam,
  updateCategory,
} from './queries/categories';
import {
  categoryOptions,
  commitImport,
  existingDedupeHashes,
  hashesParam,
  importBatchParam,
} from './queries/imports';
import { listPeriods, monthReport, monthTransactions } from './queries/reports';
import { categoryTemplateStatements } from './seeds/category-template';
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

  /** BD nueva en memoria, migrada y con los datos iniciales que cargue `seed`. */
  const open = async (seed: (db: SqlDb) => void): Promise<undefined> => {
    sqlite ??= loadSqlite();
    const sqlite3 = await sqlite;
    close();
    const raw = new sqlite3.oo1.DB(':memory:');
    const db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    seed(db);
    current = { raw, db };
    return undefined;
  };

  return {
    openDemo: () => open(loadDemoData),
    openNew: () =>
      open((db) =>
        db.transaction(() => {
          for (const { sql, bind } of categoryTemplateStatements()) db.run(sql, bind);
        }),
      ),
    close,
    periods: () => listPeriods(requireDb()),
    monthReport: (params) => monthReport(requireDb(), periodParam(params)),
    transactions: (params) => monthTransactions(requireDb(), periodParam(params)),
    categoryOptions: () => categoryOptions(requireDb()),
    categoryTree: () => categoryTree(requireDb()),
    createCategory: (params) => createCategory(requireDb(), newCategoryParam(params)),
    updateCategory: (params) => updateCategory(requireDb(), categoryUpdateParam(params)),
    deleteCategory: (params) => deleteCategory(requireDb(), categoryIdParam(params)),
    existingHashes: (params) => existingDedupeHashes(requireDb(), hashesParam(params)),
    commitImport: (params) => commitImport(requireDb(), importBatchParam(params)),
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
