import type { AccountRow, AccountUpdate, NewAccount } from '@domain/accounts/account';
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
import type {
  ConceptChange,
  ConceptRuleRow,
  ConceptRuleUpdate,
  NewConceptRule,
} from '@domain/rules/concept-rule';

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
  /**
   * Guarda la BD abierta en la copia `name` de la sesión de la pestaña (ADR-0031), para que
   * sobreviva a una recarga.
   */
  saveSession: { params: { name: string }; result: undefined };
  /**
   * Abre la primera de las copias de sesión `names` que exista y supere las mismas
   * comprobaciones que un fichero cargado; si ninguna vale, falla y no abre nada.
   */
  openSession: { params: { names: readonly string[] }; result: undefined };
  close: { params: undefined; result: undefined };
  /**
   * Idioma en que se nombran las categorías en todas las consultas (ADR-0028): un código de la
   * interfaz, o `null` para el nombre por defecto. Vale para el worker, no para la BD abierta.
   */
  setCategoryLanguage: { params: { language: string | null }; result: undefined };
  /*
   * Los informes y los movimientos son siempre de una cuenta, `accountId` (ADR-0035).
   */
  /** Los meses con movimientos de la cuenta, en orden. */
  periods: { params: { accountId: number }; result: readonly string[] };
  monthReport: { params: { period: string; accountId: number }; result: MonthReport };
  /** Hoja anual: el total de cada categoría en cada mes del año. */
  yearReport: { params: { year: number; accountId: number }; result: YearReport };
  transactions: {
    params: { period: string; accountId: number };
    result: readonly TransactionRow[];
  };
  /** Todos los movimientos de la cuenta, del más reciente al más antiguo. */
  allTransactions: { params: { accountId: number }; result: readonly TransactionRow[] };
  /** Los movimientos que forman un total del resumen del mes (ids, de menor a mayor). */
  summaryTransactionIds: {
    params: { period: string; total: SummaryTotal; accountId: number };
    result: readonly number[];
  };
  /** Guarda lo que el usuario cambia de un movimiento (concepto, fecha, categoría, notas). */
  updateTransaction: { params: TransactionEdit; result: undefined };
  /** Sustituye los submovimientos de un movimiento; una lista vacía lo deja sin dividir. */
  saveSplits: { params: TransactionSplits; result: undefined };
  /**
   * Los ingresos de la cuenta del gasto que lo devuelven o pueden devolverlo, de fecha más
   * cercana primero.
   */
  expenseRefundOptions: { params: { expenseId: number }; result: ExpenseRefundOptions };
  /** Sustituye las devoluciones de un gasto; una lista vacía lo deja sin devoluciones. */
  saveRefunds: { params: ExpenseRefunds; result: undefined };
  /** Las cuentas por nombre, con cuántos movimientos tiene cada una (ADR-0034). */
  accounts: { params: undefined; result: readonly AccountRow[] };
  /** Da de alta una cuenta y devuelve su id. */
  createAccount: { params: NewAccount; result: number };
  /** Renombra la cuenta; el banco solo cambia si no tiene movimientos. */
  updateAccount: { params: AccountUpdate; result: undefined };
  /** Elimina una cuenta sin movimientos ni extractos. */
  deleteAccount: { params: { id: number }; result: undefined };
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
  /** Las reglas de concepto (ADR-0024), en el orden en que se aplican. */
  conceptRules: { params: undefined; result: readonly ConceptRuleRow[] };
  /** Da de alta una regla de concepto y devuelve su id. */
  createConceptRule: { params: NewConceptRule; result: number };
  updateConceptRule: { params: ConceptRuleUpdate; result: undefined };
  deleteConceptRule: { params: { id: number }; result: undefined };
  /** Los conceptos que cambiarían al aplicar las reglas de concepto; no toca nada. */
  previewConceptRules: { params: undefined; result: readonly ConceptChange[] };
  /** Aplica las reglas de concepto a los movimientos existentes; devuelve cuántos han cambiado. */
  applyConceptRules: { params: undefined; result: number };
  /** El concepto que dejan las reglas de concepto en cada texto, en el mismo orden. */
  rewriteDescriptions: { params: { texts: readonly string[] }; result: readonly string[] };
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
  /** Guarda un lote revisado en la cuenta que indica, entero o nada. */
  commitImport: { params: ImportBatchInput; result: ImportBatchResult };
}
