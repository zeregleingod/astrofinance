import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { isPeriod } from '@domain/dates/period';
import { isSummaryTotal, type SummaryTotal } from '@domain/reports/summary-origin';
import type { RpcHandlers } from '../rpc/protocol';
import { exportDatabase, openDatabaseFile } from './backup';
import type { DbApi } from './db-api';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';
import {
  expenseIdParam,
  expenseRefundOptions,
  expenseRefundsParam,
  saveRefunds,
} from './queries/refunds';
import { saveSplits, transactionSplitsParam } from './queries/splits';
import { transactionEditParam, updateTransaction } from './queries/transactions';
import {
  categoryIdParam,
  categoryOrderParam,
  categoryUpdateParam,
  categoryTree,
  createCategory,
  deleteCategory,
  newCategoryParam,
  reorderCategories,
  updateCategory,
} from './queries/categories';
import {
  categoryOptions,
  commitImport,
  existingDedupeHashes,
  hashesParam,
  importBatchParam,
} from './queries/imports';
import {
  allTransactions,
  listPeriods,
  monthReport,
  monthTransactions,
  summaryTransactionIds,
  yearReport,
} from './queries/reports';
import {
  applyRules,
  createRule,
  deleteRule,
  listRules,
  newRuleParam,
  previewRules,
  ruleIdParam,
  ruleUpdateParam,
  updateRule,
} from './queries/rules';
import { suggestCategoriesFor, suggestionRequestParam } from './queries/suggestions';
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

  const requireCurrent = () => {
    if (!current) throw new Error('No hay ninguna base de datos abierta.');
    return current;
  };
  const requireDb = () => requireCurrent().db;

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
    openFile: async (params) => {
      const bytes = bytesParam(params);
      sqlite ??= loadSqlite();
      // La BD abierta no se cierra hasta que la del fichero ha pasado todas las comprobaciones.
      const raw = openDatabaseFile(await sqlite, bytes);
      close();
      const db = wrapDatabase(raw);
      current = { raw, db };
      return { transactions: Number(db.value('SELECT count(*) FROM transactions')) };
    },
    exportFile: async () => exportDatabase(await (sqlite ??= loadSqlite()), requireCurrent().raw),
    close,
    periods: () => listPeriods(requireDb()),
    monthReport: (params) => monthReport(requireDb(), periodParam(params)),
    yearReport: (params) => yearReport(requireDb(), yearParam(params)),
    transactions: (params) => monthTransactions(requireDb(), periodParam(params)),
    allTransactions: () => allTransactions(requireDb()),
    summaryTransactionIds: (params) =>
      summaryTransactionIds(requireDb(), periodParam(params), summaryTotalParam(params)),
    updateTransaction: (params) => updateTransaction(requireDb(), transactionEditParam(params)),
    saveSplits: (params) => saveSplits(requireDb(), transactionSplitsParam(params)),
    expenseRefundOptions: (params) => expenseRefundOptions(requireDb(), expenseIdParam(params)),
    saveRefunds: (params) => saveRefunds(requireDb(), expenseRefundsParam(params)),
    categoryOptions: () => categoryOptions(requireDb()),
    categoryTree: () => categoryTree(requireDb()),
    createCategory: (params) => createCategory(requireDb(), newCategoryParam(params)),
    updateCategory: (params) => updateCategory(requireDb(), categoryUpdateParam(params)),
    deleteCategory: (params) => deleteCategory(requireDb(), categoryIdParam(params)),
    reorderCategories: (params) => reorderCategories(requireDb(), categoryOrderParam(params)),
    rules: () => listRules(requireDb()),
    createRule: (params) => createRule(requireDb(), newRuleParam(params)),
    updateRule: (params) => updateRule(requireDb(), ruleUpdateParam(params)),
    deleteRule: (params) => deleteRule(requireDb(), ruleIdParam(params)),
    previewRules: () => previewRules(requireDb()),
    applyRules: () => applyRules(requireDb()),
    existingHashes: (params) => existingDedupeHashes(requireDb(), hashesParam(params)),
    suggestCategories: (params) =>
      suggestCategoriesFor(requireDb(), suggestionRequestParam(params)),
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

function summaryTotalParam(params: unknown): SummaryTotal {
  const total: unknown =
    typeof params === 'object' && params !== null
      ? (params as { total?: unknown }).total
      : undefined;
  if (!isSummaryTotal(total)) throw new RangeError('Total del resumen no válido.');
  return total;
}

function yearParam(params: unknown): number {
  const year: unknown =
    typeof params === 'object' && params !== null ? (params as { year?: unknown }).year : undefined;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError('Año no válido (AAAA).');
  }
  return year;
}

function bytesParam(params: unknown): Uint8Array {
  const bytes: unknown =
    typeof params === 'object' && params !== null
      ? (params as { bytes?: unknown }).bytes
      : undefined;
  // `instanceof` no sirve si el array viene de otro contexto (otro hilo, un iframe).
  if (Object.prototype.toString.call(bytes) !== '[object Uint8Array]') {
    throw new RangeError('Fichero no válido.');
  }
  return bytes as Uint8Array;
}
