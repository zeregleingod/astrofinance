/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { DbApi } from './db/db-api';
import { createDbHandlers } from './db/db-handlers';
import { serveRpc } from './rpc/rpc-server';

// Toda la base de datos vive en este worker; el hilo principal solo habla por RPC.
serveRpc<DbApi>(self, createDbHandlers(sqlite3InitModule));
