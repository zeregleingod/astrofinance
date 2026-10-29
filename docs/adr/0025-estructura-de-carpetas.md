# ADR-0025: Estructura de carpetas en cinco capas

- **Estado:** aceptado (sustituye las capas de ADR-0001; el stack sigue vigente)
- **Fecha:** 2026-10-29

## Contexto

Las seis capas de ADR-0001 (`domain`, `workers`, `data`, `core`, `shared`, `features`) se
solapaban: `core` era a la vez armazón visual, estado de la app y textos; `core` y `data` podían
importarse mutuamente; `core/period/` existía solo porque `shared` no podía importar `data`; y
el armazón (`app.ts`) dependía de una _feature_ (`settings/backup-quick-actions`).

## Decisión

Cinco carpetas en `src/app/`; cada una responde a una sola pregunta y las dependencias van en un
único sentido:

```
pages ──► ui ──────────────────────────► domain
  └────► services ──► worker (contratos) ──► domain
```

| Carpeta    | Qué contiene                                                    | Puede importar                                        |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| `domain`   | Reglas de negocio en TypeScript puro                            | nada más                                              |
| `worker`   | Lo que corre en Web Workers (SQLite, SheetJS, servidor RPC)     | `domain`, SQLite, SheetJS                             |
| `services` | Estado y datos de la app en el hilo principal, sin UI ni textos | `domain`, y de `worker` solo `*-api` y `rpc/protocol` |
| `ui`       | Piezas visuales reutilizables y los textos (`ui/texts.ts`)      | `domain`                                              |
| `pages`    | Una carpeta por pantalla, más `shell/` (el armazón)             | `ui`, `services`, `domain`; nunca otra página         |

- Dentro de una página se importa con rutas relativas (`./x`); el alias `@pages/*` solo lo usan
  `app.ts`, `app.config.ts` y `app.routes.ts`.
- Pantallas hermanas que comparten piezas van en la misma carpeta (`pages/rules/`: reglas de
  categoría y de concepto comparten hoja de estilos).
- Un servicio no produce textos ni abre diálogos: guarda el resultado como datos (códigos) y la UI
  lo traduce (p. ej. `BackupService` + `ui/backup/backup-messages.ts`).
- Alias: `@domain/*`, `@worker/*`, `@services/*`, `@ui/*`, `@pages/*`. Fronteras en
  `eslint.config.mjs`, verificadas por `npm run lint:boundaries`.

Correspondencia con la estructura anterior (para leer los ADR previos):

| Antes                                             | Ahora                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| `workers/`                                        | `worker/`                                            |
| `data/db`, `data/rpc`, `data/files`               | `services/db`, `services/rpc`, `services/files`      |
| `data/imports`                                    | `services/import`                                    |
| `core/period`, `core/theme`, `core/demo`          | `services/period`, `services/theme`, `services/demo` |
| `core/layout/viewport.ts`                         | `services/viewport/viewport.ts`                      |
| `core/layout`, `core/navigation`                  | `pages/shell`                                        |
| `core/i18n/texts.ts`                              | `ui/texts.ts`                                        |
| `shared/*`                                        | `ui/*`                                               |
| `features/settings/backup-service.ts`             | `services/backup/backup-service.ts`                  |
| `features/settings/backup-quick-actions.ts`       | `pages/shell/backup-quick-actions.ts`                |
| `features/settings/backup-page`                   | `pages/backup/`                                      |
| `features/settings/categories-page`               | `pages/categories/`                                  |
| `features/settings/{category,concept}-rules-page` | `pages/rules/`                                       |
| `features/imports`                                | `pages/import`                                       |
| `features/{dashboard,yearly,transactions}`        | `pages/{dashboard,yearly,transactions}`              |

## Consecuencias

- Desaparecen `core/` y `data/`, y con ellos la dependencia circular permitida y el parche de
  `core/period/`.
- El armazón ya no depende de una pantalla: los accesos rápidos de copia viven en `pages/shell/`.
- Los ADR anteriores mantienen las rutas antiguas; la tabla de arriba las traduce.
- Pendiente (fuera de esta reorganización): partir los ficheros más grandes
  (`pages/transactions/transaction-cards.ts`, `services/db/db-service.ts`).
