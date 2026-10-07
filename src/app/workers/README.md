# workers

Web Workers: SQLite WASM + OPFS, lectura de ficheros bancarios (SheetJS).

- Solo importan `domain` (y librerías propias del worker: `@sqlite.org/sqlite-wasm`, `xlsx`).
- Nunca `@angular/*`, `core`, `data`, `features` ni `shared`.
- Ficheros de entrada: `*.worker.ts` (compilados con `tsconfig.worker.json`).
