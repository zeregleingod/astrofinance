import { InjectionToken, Service, computed, inject, signal } from '@angular/core';
import type { MonthReport } from '@domain/reports/month-report';
import type { TransactionRow } from '@domain/reports/transaction-row';
import type { DbApi } from '@workers/db/db-api';
import type { RpcEndpoint } from '@workers/rpc/protocol';
import { RpcClient } from '../rpc/rpc-client';

export type DbStatus = 'cerrada' | 'abriendo' | 'lista' | 'error';
export type DbMode = 'demo';

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

  private readonly statusSignal = signal<DbStatus>('cerrada');
  private readonly modeSignal = signal<DbMode | null>(null);
  private readonly versionSignal = signal(0);

  readonly status = this.statusSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  readonly dataVersion = this.versionSignal.asReadonly();
  readonly ready = computed(() => this.statusSignal() === 'lista');

  /** Abre la demo: una BD nueva en memoria con datos ficticios que nunca se guarda. */
  openDemo(): Promise<void> {
    if (this.opening) return this.opening;
    if (this.modeSignal() === 'demo' && this.ready()) return Promise.resolve();

    this.close();
    this.statusSignal.set('abriendo');
    const worker = this.createWorker();
    const client = new RpcClient<DbApi>(worker);
    this.connection = { worker, client };

    this.opening = client
      .call('openDemo', undefined, { timeoutMs: OPEN_TIMEOUT_MS })
      .then(() => {
        this.modeSignal.set('demo');
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

  private call<T>(fn: (client: RpcClient<DbApi>) => Promise<T>): Promise<T> {
    if (!this.connection || !this.ready()) {
      return Promise.reject(new Error('No hay ninguna base de datos abierta.'));
    }
    return fn(this.connection.client);
  }
}
