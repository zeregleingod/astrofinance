# features

Pantallas cargadas de forma _lazy_ (dashboard, movimientos, categorías, reglas, importación, recurrentes, ajustes).

- Pueden importar `core`, `data`, `domain` y `shared`.
- **No** importan `workers` (siempre a través de `data`).
- Una _feature_ no importa otra _feature_.
