import type { RestoredDatabase } from '@domain/backup/database-file';
import type {
  CategoryGroup,
  CategoryOrder,
  CategoryUpdate,
  NewCategory,
} from '@domain/categories/category-tree';
import type {
  CategoryOption,
  ImportBatchInput,
  ImportBatchResult,
} from '@domain/imports/import-batch';
import type { MonthReport } from '@domain/reports/month-report';
import type { SummaryTotal } from '@domain/reports/summary-origin';
import type { TransactionRow } from '@domain/reports/transaction-row';
import type { YearReport } from '@domain/reports/year-report';
import type {
  CategorySuggestion,
  SuggestionRequest,
} from '@domain/suggestions/category-suggestion';
import type { TransactionEdit } from '@domain/transactions/transaction-edit';
import type { ExpenseRefundOptions, ExpenseRefunds } from '@domain/transactions/refund';
import type { TransactionSplits } from '@domain/transactions/transaction-split';
import type { NewRule, RuleChange, RuleRow, RuleUpdate } from '@domain/rules/rule';

/** Contrato RPC del worker de base de datos. */
export interface DbApi {
  /** Abre una BD nueva en memoria con los datos de demo. Nunca se guarda. */
  openDemo: { params: undefined; result: undefined };
  /** Abre una BD nueva en memoria, vacía salvo la plantilla de categorías. */
  openNew: { params: undefined; result: undefined };
  /**
   * Sustituye la BD abierta por la de un fichero `.db`, si supera todas las comprobaciones;
   * si no, falla con un `BackupError` y la BD abierta queda como estaba.
   */
  openFile: { params: { bytes: Uint8Array }; result: RestoredDatabase };
  /** El contenido de la BD abierta como fichero de SQLite. */
  exportFile: { params: undefined; result: Uint8Array<ArrayBuffer> };
  close: { params: undefined; result: undefined };
  periods: { params: undefined; result: readonly string[] };
  monthReport: { params: { period: string }; result: MonthReport };
  /** Hoja anual: el total de cada categoría en cada mes del año. */
  yearReport: { params: { year: number }; result: YearReport };
  transactions: { params: { period: string }; result: readonly TransactionRow[] };
  /** Todos los movimientos, del más reciente al más antiguo. */
  allTransactions: { params: undefined; result: readonly TransactionRow[] };
  /** Los movimientos que forman un total del resumen del mes (ids, de menor a mayor). */
  summaryTransactionIds: {
    params: { period: string; total: SummaryTotal };
    result: readonly number[];
  };
  /** Guarda lo que el usuario cambia de un movimiento (concepto, fecha, categoría, notas). */
  updateTransaction: { params: TransactionEdit; result: undefined };
  /** Sustituye los submovimientos de un movimiento; una lista vacía lo deja sin dividir. */
  saveSplits: { params: TransactionSplits; result: undefined };
  /** Los ingresos que devuelven un gasto o pueden devolverlo, de fecha más cercana primero. */
  expenseRefundOptions: { params: { expenseId: number }; result: ExpenseRefundOptions };
  /** Sustituye las devoluciones de un gasto; una lista vacía lo deja sin devoluciones. */
  saveRefunds: { params: ExpenseRefunds; result: undefined };
  categoryOptions: { params: undefined; result: readonly CategoryOption[] };
  categoryTree: { params: undefined; result: readonly CategoryGroup[] };
  /** Da de alta una categoría o subcategoría y devuelve su id. */
  createCategory: { params: NewCategory; result: number };
  updateCategory: { params: CategoryUpdate; result: undefined };
  /** Elimina la categoría (y sus subcategorías); devuelve los movimientos que quedan sin categoría. */
  deleteCategory: { params: { id: number }; result: number };
  /** Ordena las principales, o las subcategorías de una principal, como indica la lista. */
  reorderCategories: { params: CategoryOrder; result: undefined };
  /** Las reglas de clasificación, en el orden en que se aplican. */
  rules: { params: undefined; result: readonly RuleRow[] };
  /** Da de alta una regla y devuelve su id. */
  createRule: { params: NewRule; result: number };
  updateRule: { params: RuleUpdate; result: undefined };
  deleteRule: { params: { id: number }; result: undefined };
  /** Los movimientos que cambiarían de categoría al aplicar las reglas; no toca nada. */
  previewRules: { params: undefined; result: readonly RuleChange[] };
  /** Aplica las reglas a los movimientos existentes; devuelve cuántos han cambiado. */
  applyRules: { params: undefined; result: number };
  /** De las huellas indicadas, las de movimientos que ya están guardados. */
  existingHashes: { params: { hashes: readonly string[] }; result: readonly string[] };
  /**
   * La categoría que se propone para cada movimiento de un extracto, en el mismo orden: por las
   * reglas o por los movimientos parecidos ya clasificados (ADR-0018); `null` si ninguna.
   */
  suggestCategories: {
    params: SuggestionRequest;
    result: readonly (CategorySuggestion | null)[];
  };
  /** Guarda un lote revisado, entero o nada. */
  commitImport: { params: ImportBatchInput; result: ImportBatchResult };
}
