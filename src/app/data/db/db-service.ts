import { InjectionToken, Service, computed, inject, signal } from '@angular/core';
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
import type { SummaryOrigin } from '@domain/reports/summary-origin';
import type { TransactionRow } from '@domain/reports/transaction-row';
import type { YearReport } from '@domain/reports/year-report';
import type { NewRule, RuleChange, RuleRow, RuleUpdate } from '@domain/rules/rule';
import type {
  ConceptChange,
  ConceptRuleRow,
  ConceptRuleUpdate,
  NewConceptRule,
} from '@domain/rules/concept-rule';
import type {
  CategorySuggestion,
  SuggestionRequest,
} from '@domain/suggestions/category-suggestion';
import type { TransactionEdit } from '@domain/transactions/transaction-edit';
import type { ExpenseRefundOptions, ExpenseRefunds } from '@domain/transactions/refund';
import type { TransactionSplits } from '@domain/transactions/transaction-split';
import type { DbApi } from '@workers/db/db-api';
import type { RpcEndpoint } from '@workers/rpc/protocol';
import { RpcClient } from '../rpc/rpc-client';

export type DbStatus = 'cerrada' | 'abriendo' | 'lista' | 'error';
/**
 * `demo`: datos ficticios. `local`: los datos del usuario, que viven en memoria y se conservan
 * descargando una copia (ADR-0010).
 */
export type DbMode = 'demo' | 'local';

export interface DbWorker extends RpcEndpoint {
  terminate(): void;
}

/** Crea el worker de BD; los tests lo sustituyen por uno en el mismo hilo. */
export const DB_WORKER_FACTORY = new InjectionToken<() => DbWorker>('DB_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => () =>
    new Worker(new URL('../../workers/db.worker', import.meta.url), { type: 'module' }),
});

/** Cargar SQLite WASM y la demo puede tardar en móviles modestos. */
const OPEN_TIMEOUT_MS = 30_000;
/** Comprobar o serializar una BD grande y pasarla entre hilos tampoco es inmediato. */
const FILE_TIMEOUT_MS = 60_000;

/**
 * Fachada de la base de datos (T3.2). Toda la BD vive en un worker; aquí solo hay estado
 * de solo lectura en signals y llamadas RPC. `dataVersion` cambia cada vez que cambian los
 * datos para que las consultas dependientes se repitan.
 */
@Service()
export class DbService {
  private readonly createWorker = inject(DB_WORKER_FACTORY);
  private connection: { worker: DbWorker; client: RpcClient<DbApi> } | undefined;
  private opening: Promise<void> | undefined;
  private openingMode: DbMode | undefined;

  private readonly statusSignal = signal<DbStatus>('cerrada');
  private readonly modeSignal = signal<DbMode | null>(null);
  private readonly versionSignal = signal(0);
  private readonly userDataSignal = signal(false);

  readonly status = this.statusSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  readonly dataVersion = this.versionSignal.asReadonly();
  /**
   * La BD del usuario contiene algo suyo (un extracto importado, un cambio en las categorías)
   * que se perdería al abrir la demo. Tenerla abierta solo con la plantilla no cuenta.
   */
  readonly hasUserData = this.userDataSignal.asReadonly();
  readonly ready = computed(() => this.statusSignal() === 'lista');

  /** Abre la demo: una BD nueva en memoria con datos ficticios que nunca se guarda. */
  openDemo(): Promise<void> {
    return this.open('demo');
  }

  /**
   * Abre la BD del usuario: vacía salvo la plantilla de categorías. Mientras no exista el
   * guardado en disco (T2.7–T2.8) vive solo en memoria y se pierde al recargar la página.
   */
  openLocal(): Promise<void> {
    return this.open('local');
  }

  /**
   * Sustituye la BD abierta (también la demo) por la de un fichero `.db` (T2.11), que pasa a
   * ser la del usuario. Si el fichero no vale rechaza con un `BackupError` (ver
   * `backupErrorCode`) y los datos que hubiera siguen como estaban.
   */
  async restore(bytes: Uint8Array): Promise<RestoredDatabase> {
    // El worker valida el fichero en una BD aparte; hace falta tener uno en marcha.
    if (!this.ready()) await this.openLocal();
    const restored = await this.call((c) =>
      c.call('openFile', { bytes }, { timeoutMs: FILE_TIMEOUT_MS }),
    );
    this.modeSignal.set('local');
    this.userDataSignal.set(true);
    this.versionSignal.update((v) => v + 1);
    return restored;
  }

  /** El contenido de la BD abierta como fichero `.db` (T2.12). */
  exportFile(): Promise<Uint8Array<ArrayBuffer>> {
    return this.call((c) => c.call('exportFile', undefined, { timeoutMs: FILE_TIMEOUT_MS }));
  }

  private open(mode: DbMode): Promise<void> {
    if (this.opening) {
      // Si se está abriendo en otro modo, se espera a que termine y se abre el pedido.
      return this.openingMode === mode ? this.opening : this.opening.then(() => this.open(mode));
    }
    if (this.modeSignal() === mode && this.ready()) return Promise.resolve();

    this.close();
    this.statusSignal.set('abriendo');
    const worker = this.createWorker();
    const client = new RpcClient<DbApi>(worker);
    this.connection = { worker, client };
    this.openingMode = mode;

    this.opening = client
      .call(mode === 'demo' ? 'openDemo' : 'openNew', undefined, { timeoutMs: OPEN_TIMEOUT_MS })
      .then(() => {
        this.modeSignal.set(mode);
        this.statusSignal.set('lista');
        this.versionSignal.update((v) => v + 1);
      })
      .catch((error: unknown) => {
        this.close();
        this.statusSignal.set('error');
        throw error;
      })
      .finally(() => {
        this.opening = undefined;
      });
    return this.opening;
  }

  close(): void {
    const connection = this.connection;
    this.connection = undefined;
    if (connection) {
      connection.client.dispose();
      connection.worker.terminate();
      this.versionSignal.update((v) => v + 1);
    }
    this.modeSignal.set(null);
    this.userDataSignal.set(false);
    this.statusSignal.set('cerrada');
  }

  periods(signal?: AbortSignal): Promise<readonly string[]> {
    return this.call((c) => c.call('periods', undefined, { signal }));
  }

  monthReport(period: string, signal?: AbortSignal): Promise<MonthReport> {
    return this.call((c) => c.call('monthReport', { period }, { signal }));
  }

  yearReport(year: number, signal?: AbortSignal): Promise<YearReport> {
    return this.call((c) => c.call('yearReport', { year }, { signal }));
  }

  transactions(period: string, signal?: AbortSignal): Promise<readonly TransactionRow[]> {
    return this.call((c) => c.call('transactions', { period }, { signal }));
  }

  /** Todos los movimientos, del más reciente al más antiguo. */
  allTransactions(signal?: AbortSignal): Promise<readonly TransactionRow[]> {
    return this.call((c) =>
      c.call('allTransactions', undefined, { signal, timeoutMs: OPEN_TIMEOUT_MS }),
    );
  }

  /** Los movimientos que forman un total del resumen del mes (ids, de menor a mayor). */
  summaryTransactionIds(origin: SummaryOrigin, signal?: AbortSignal): Promise<readonly number[]> {
    return this.call((c) => c.call('summaryTransactionIds', origin, { signal }));
  }

  /** Guarda lo que el usuario cambia de un movimiento y avisa de que hay datos nuevos. */
  async updateTransaction(edit: TransactionEdit): Promise<void> {
    await this.call((c) => c.call('updateTransaction', edit));
    this.dataChanged();
  }

  /** Guarda los submovimientos de un movimiento y avisa de que hay datos nuevos. */
  async saveSplits(splits: TransactionSplits): Promise<void> {
    await this.call((c) => c.call('saveSplits', splits));
    this.dataChanged();
  }

  /** Los ingresos que devuelven un gasto o pueden devolverlo. */
  expenseRefundOptions(expenseId: number, signal?: AbortSignal): Promise<ExpenseRefundOptions> {
    return this.call((c) => c.call('expenseRefundOptions', { expenseId }, { signal }));
  }

  /** Guarda las devoluciones de un gasto y avisa de que hay datos nuevos. */
  async saveRefunds(refunds: ExpenseRefunds): Promise<void> {
    await this.call((c) => c.call('saveRefunds', refunds));
    this.dataChanged();
  }

  categoryOptions(signal?: AbortSignal): Promise<readonly CategoryOption[]> {
    return this.call((c) => c.call('categoryOptions', undefined, { signal }));
  }

  categoryTree(signal?: AbortSignal): Promise<readonly CategoryGroup[]> {
    return this.call((c) => c.call('categoryTree', undefined, { signal }));
  }

  /** Da de alta una categoría o subcategoría y avisa a las consultas de que hay datos nuevos. */
  async createCategory(category: NewCategory): Promise<number> {
    const id = await this.call((c) => c.call('createCategory', category));
    this.dataChanged();
    return id;
  }

  async updateCategory(update: CategoryUpdate): Promise<void> {
    await this.call((c) => c.call('updateCategory', update));
    this.dataChanged();
  }

  /**
   * Elimina una categoría (y sus subcategorías). Sus movimientos quedan sin categoría;
   * devuelve cuántos.
   */
  async deleteCategory(id: number): Promise<number> {
    const freed = await this.call((c) => c.call('deleteCategory', { id }));
    this.dataChanged();
    return freed;
  }

  /** Cambia el orden de las principales, o de las subcategorías de una, en todas las vistas. */
  async reorderCategories(order: CategoryOrder): Promise<void> {
    await this.call((c) => c.call('reorderCategories', order));
    this.dataChanged();
  }

  /** Las reglas de clasificación, en el orden en que se aplican. */
  rules(signal?: AbortSignal): Promise<readonly RuleRow[]> {
    return this.call((c) => c.call('rules', undefined, { signal }));
  }

  async createRule(rule: NewRule): Promise<number> {
    const id = await this.call((c) => c.call('createRule', rule));
    this.dataChanged();
    return id;
  }

  async updateRule(update: RuleUpdate): Promise<void> {
    await this.call((c) => c.call('updateRule', update));
    this.dataChanged();
  }

  /** Elimina la regla; los movimientos que clasificó conservan su categoría. */
  async deleteRule(id: number): Promise<void> {
    await this.call((c) => c.call('deleteRule', { id }));
    this.dataChanged();
  }

  /** Los movimientos que cambiarían de categoría al aplicar las reglas; no toca nada. */
  previewRules(signal?: AbortSignal): Promise<readonly RuleChange[]> {
    return this.call((c) =>
      c.call('previewRules', undefined, { signal, timeoutMs: OPEN_TIMEOUT_MS }),
    );
  }

  /** Aplica las reglas a los movimientos existentes y devuelve cuántos han cambiado. */
  async applyRules(): Promise<number> {
    const changed = await this.call((c) =>
      c.call('applyRules', undefined, { timeoutMs: OPEN_TIMEOUT_MS }),
    );
    if (changed > 0) this.dataChanged();
    return changed;
  }

  /** Las reglas de concepto, en el orden en que se aplican. */
  conceptRules(signal?: AbortSignal): Promise<readonly ConceptRuleRow[]> {
    return this.call((c) => c.call('conceptRules', undefined, { signal }));
  }

  async createConceptRule(rule: NewConceptRule): Promise<number> {
    const id = await this.call((c) => c.call('createConceptRule', rule));
    this.dataChanged();
    return id;
  }

  async updateConceptRule(update: ConceptRuleUpdate): Promise<void> {
    await this.call((c) => c.call('updateConceptRule', update));
    this.dataChanged();
  }

  /** Elimina la regla; los conceptos que cambió siguen así hasta volver a aplicar las reglas. */
  async deleteConceptRule(id: number): Promise<void> {
    await this.call((c) => c.call('deleteConceptRule', { id }));
    this.dataChanged();
  }

  /** Los conceptos que cambiarían al aplicar las reglas de concepto; no toca nada. */
  previewConceptRules(signal?: AbortSignal): Promise<readonly ConceptChange[]> {
    return this.call((c) =>
      c.call('previewConceptRules', undefined, { signal, timeoutMs: OPEN_TIMEOUT_MS }),
    );
  }

  /** Aplica las reglas de concepto a los movimientos existentes y devuelve cuántos han cambiado. */
  async applyConceptRules(): Promise<number> {
    const changed = await this.call((c) =>
      c.call('applyConceptRules', undefined, { timeoutMs: OPEN_TIMEOUT_MS }),
    );
    if (changed > 0) this.dataChanged();
    return changed;
  }

  /** El concepto que dejan las reglas de concepto en cada texto de un extracto, en orden. */
  rewriteDescriptions(texts: readonly string[], signal?: AbortSignal): Promise<readonly string[]> {
    return this.call((c) =>
      c.call('rewriteDescriptions', { texts }, { signal, timeoutMs: OPEN_TIMEOUT_MS }),
    );
  }

  existingHashes(hashes: readonly string[], signal?: AbortSignal): Promise<readonly string[]> {
    return this.call((c) => c.call('existingHashes', { hashes }, { signal }));
  }

  /** La categoría que se propone para cada movimiento de un extracto, en el mismo orden. */
  suggestCategories(
    request: SuggestionRequest,
    signal?: AbortSignal,
  ): Promise<readonly (CategorySuggestion | null)[]> {
    return this.call((c) =>
      c.call('suggestCategories', request, { signal, timeoutMs: OPEN_TIMEOUT_MS }),
    );
  }

  /** Guarda un lote de importación revisado y avisa a las consultas de que hay datos nuevos. */
  async commitImport(batch: ImportBatchInput): Promise<ImportBatchResult> {
    const result = await this.call((c) =>
      c.call('commitImport', batch, { timeoutMs: OPEN_TIMEOUT_MS }),
    );
    if (result.inserted > 0) this.dataChanged();
    return result;
  }

  /** Avisa a las consultas de que hay datos nuevos y anota que la BD ya tiene algo del usuario. */
  private dataChanged(): void {
    this.versionSignal.update((v) => v + 1);
    if (this.modeSignal() === 'local') this.userDataSignal.set(true);
  }

  private call<T>(fn: (client: RpcClient<DbApi>) => Promise<T>): Promise<T> {
    if (!this.connection || !this.ready()) {
      return Promise.reject(new Error('No hay ninguna base de datos abierta.'));
    }
    return fn(this.connection.client);
  }
}
