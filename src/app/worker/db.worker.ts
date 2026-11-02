/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { DbApi } from './db/db-api';
import { createDbHandlers } from './db/db-handlers';
import { opfsSessionFiles } from './db/session-files';
import { serveRpc } from './rpc/rpc-server';

// Toda la base de datos vive en este worker; el hilo principal solo habla por RPC. La sesión de
// la pestaña se copia en OPFS si el navegador lo tiene (ADR-0031).
serveRpc<DbApi>(
  self,
  createDbHandlers(sqlite3InitModule, 'storage' in navigator ? opfsSessionFiles : undefined),
);
