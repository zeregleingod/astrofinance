# worker

Lo que corre en Web Workers: SQLite WASM + OPFS (`db/`), lectura de extractos con SheetJS
(`import/`) y el servidor RPC (`rpc/`).

- Importa solo `domain` y sus librerías (`@sqlite.org/sqlite-wasm`, `xlsx`). Nunca Angular ni RxJS.
- Cada módulo: `x.worker.ts` (entrada), `x-api.ts` (contrato), `x-handlers.ts` (implementación).
- Desde fuera solo se importan los contratos: `*-api.ts` y `rpc/protocol.ts`.
