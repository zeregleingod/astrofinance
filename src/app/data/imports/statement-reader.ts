import { InjectionToken, Service, inject } from '@angular/core';
import { MAX_STATEMENT_BYTES, StatementError } from '@domain/imports/bank-statement';
import type { ImportedStatement } from '@domain/imports/imported-statement';
import type { ImportApi } from '@workers/import/import-api';
import type { RpcEndpoint } from '@workers/rpc/protocol';
import { RpcClient } from '../rpc/rpc-client';

export interface ImportWorker extends RpcEndpoint {
  terminate(): void;
}

/** Crea el worker que lee ficheros; los tests lo sustituyen por uno en el mismo hilo. */
export const IMPORT_WORKER_FACTORY = new InjectionToken<() => ImportWorker>(
  'IMPORT_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => () =>
      new Worker(new URL('../../workers/import.worker', import.meta.url), { type: 'module' }),
  },
);

/** Cargar SheetJS y leer el fichero puede tardar en móviles modestos. */
const READ_TIMEOUT_MS = 30_000;

/**
 * Lee extractos bancarios (T6.1) en un worker que se crea para cada fichero y se destruye al
 * terminar: SheetJS no se carga hasta que hace falta y nunca toca el hilo principal ni la BD.
 */
@Service()
export class StatementReader {
  private readonly createWorker = inject(IMPORT_WORKER_FACTORY);

  /** Rechaza con un `StatementError` (ver `statementErrorCode`) si el fichero no sirve. */
  async read(file: File): Promise<ImportedStatement> {
    if (file.size > MAX_STATEMENT_BYTES) throw new StatementError('fichero-demasiado-grande');
    const bytes = await file.arrayBuffer();

    const worker = this.createWorker();
    const client = new RpcClient<ImportApi>(worker);
    try {
      return await client.call(
        'readStatement',
        { name: file.name, bytes },
        { timeoutMs: READ_TIMEOUT_MS },
      );
    } finally {
      client.dispose();
      worker.terminate();
    }
  }
}
