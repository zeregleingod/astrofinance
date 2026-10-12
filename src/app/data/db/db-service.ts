import { InjectionToken, Service, computed, inject, signal } from '@angular/core';
import type { CategoryGroup, CategoryUpdate, NewCategory } from '@domain/categories/category-tree';
import type {
  CategoryOption,
  ImportBatchInput,
  ImportBatchResult,
} from '@domain/imports/import-batch';
import type { MonthReport } from '@domain/reports/month-report';
import type { TransactionRow } from '@domain/reports/transaction-row';
import type { DbApi } from '@workers/db/db-api';
import type { RpcEndpoint } from '@workers/rpc/protocol';
import { RpcClient } from '../rpc/rpc-client';

export type DbStatus = 'cerrada' | 'abriendo' | 'lista' | 'error';
/** `demo`: datos ficticios. `local`: los datos del usuario (por ahora solo en memoria). */
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

  transactions(period: string, signal?: AbortSignal): Promise<readonly TransactionRow[]> {
    return this.call((c) => c.call('transactions', { period }, { signal }));
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

  existingHashes(hashes: readonly string[], signal?: AbortSignal): Promise<readonly string[]> {
    return this.call((c) => c.call('existingHashes', { hashes }, { signal }));
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
