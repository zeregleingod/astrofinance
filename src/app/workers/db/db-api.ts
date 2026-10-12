import type { CategoryGroup, CategoryUpdate, NewCategory } from '@domain/categories/category-tree';
import type {
  CategoryOption,
  ImportBatchInput,
  ImportBatchResult,
} from '@domain/imports/import-batch';
import type { MonthReport } from '@domain/reports/month-report';
import type { TransactionRow } from '@domain/reports/transaction-row';

/** Contrato RPC del worker de base de datos. */
export interface DbApi {
  /** Abre una BD nueva en memoria con los datos de demo. Nunca se guarda. */
  openDemo: { params: undefined; result: undefined };
  /** Abre una BD nueva en memoria, vacía salvo la plantilla de categorías. */
  openNew: { params: undefined; result: undefined };
  close: { params: undefined; result: undefined };
  periods: { params: undefined; result: readonly string[] };
  monthReport: { params: { period: string }; result: MonthReport };
  transactions: { params: { period: string }; result: readonly TransactionRow[] };
  categoryOptions: { params: undefined; result: readonly CategoryOption[] };
  categoryTree: { params: undefined; result: readonly CategoryGroup[] };
  /** Da de alta una categoría o subcategoría y devuelve su id. */
  createCategory: { params: NewCategory; result: number };
  updateCategory: { params: CategoryUpdate; result: undefined };
  /** Elimina la categoría (y sus subcategorías); devuelve los movimientos que quedan sin categoría. */
  deleteCategory: { params: { id: number }; result: number };
  /** De las huellas indicadas, las de movimientos que ya están guardados. */
  existingHashes: { params: { hashes: readonly string[] }; result: readonly string[] };
  /** Guarda un lote revisado, entero o nada. */
  commitImport: { params: ImportBatchInput; result: ImportBatchResult };
}
