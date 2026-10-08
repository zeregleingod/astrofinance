import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { DbWorker } from '@data/db/db-service';
import type { DbApi } from '@workers/db/db-api';
import { createDbHandlers } from '@workers/db/db-handlers';
import type { RpcEndpoint } from '@workers/rpc/protocol';
import { serveRpc } from '@workers/rpc/rpc-server';

type Listener = (event: MessageEvent) => void;

/**
 * Solo para tests: el worker real de BD (SQLite incluido) ejecutándose en el mismo hilo,
 * con mensajes asíncronos y clonado estructurado como entre hilos de verdad.
 */
export function inProcessDbWorker(): DbWorker & { readonly terminated: () => boolean } {
  const toWorker = new Set<Listener>();
  const toMain = new Set<Listener>();
  let terminated = false;
  const deliver = (listeners: Set<Listener>, message: unknown) =>
    setTimeout(() => {
      const event = new MessageEvent('message', { data: structuredClone(message) });
      listeners.forEach((l) => l(event));
    });

  const workerSide: RpcEndpoint = {
    postMessage: (message) => deliver(toMain, message),
    addEventListener: (_type, listener) => toWorker.add(listener),
    removeEventListener: (_type, listener) => toWorker.delete(listener),
  };
  serveRpc<DbApi>(workerSide, createDbHandlers(sqlite3InitModule));

  return {
    postMessage: (message) => deliver(toWorker, message),
    addEventListener: (_type, listener) => toMain.add(listener),
    removeEventListener: (_type, listener) => toMain.delete(listener),
    terminate: () => {
      terminated = true;
      toWorker.clear();
    },
    terminated: () => terminated,
  };
}
