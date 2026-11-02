import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { DbApi } from '@worker/db/db-api';
import { createDbHandlers } from '@worker/db/db-handlers';
import type { SessionFiles } from '@worker/db/session-files';
import { serveRpc } from '@worker/rpc/rpc-server';
import { inProcessWorker, type InProcessWorker } from './in-process-worker';

/** Solo para tests: el worker real de BD (SQLite incluido) ejecutándose en el mismo hilo. */
export function inProcessDbWorker(): InProcessWorker {
  return inProcessDbWorkerWith()();
}

/** Como `inProcessDbWorker`, con las copias de la sesión de la pestaña en `sessionFiles`. */
export function inProcessDbWorkerWith(sessionFiles?: SessionFiles): () => InProcessWorker {
  return () =>
    inProcessWorker((endpoint) =>
      serveRpc<DbApi>(endpoint, createDbHandlers(sqlite3InitModule, sessionFiles)),
    );
}
