import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { DbApi } from '@workers/db/db-api';
import { createDbHandlers } from '@workers/db/db-handlers';
import { serveRpc } from '@workers/rpc/rpc-server';
import { inProcessWorker, type InProcessWorker } from './in-process-worker';

/** Solo para tests: el worker real de BD (SQLite incluido) ejecutándose en el mismo hilo. */
export function inProcessDbWorker(): InProcessWorker {
  return inProcessWorker((endpoint) =>
    serveRpc<DbApi>(endpoint, createDbHandlers(sqlite3InitModule)),
  );
}
