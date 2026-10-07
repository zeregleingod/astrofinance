# ADR-0001: Arquitectura por capas y stack base

- **Estado:** aceptado
- **Fecha:** 2026-10-07

## Contexto

Gestor financiero personal **100 % offline**: los datos nunca salen del dispositivo. Debe
funcionar en escritorio y móvil, ser instalable y aguantar decenas de miles de movimientos sin
bloquear la UI.

## Decisión

**Stack (versiones fijadas en `package.json` + `package-lock.json`):**

| Pieza                  | Versión                                  | Notas                                                                  |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Node                   | 24.19.0 LTS (`.nvmrc`, `engines`)        | npm 11.17 (`packageManager`)                                           |
| Angular / CLI          | 22.2                                     | standalone, zoneless (por defecto en v22), OnPush por defecto, Signals |
| Angular Material / CDK | 22.2                                     | Material 3, tema claro/oscuro según el sistema                         |
| TypeScript             | 6.0                                      | `strict`, `noUncheckedIndexedAccess`, `strictTemplates`                |
| SQLite WASM oficial    | `@sqlite.org/sqlite-wasm` 3.53.4         | en Web Worker, persistencia en OPFS (spike en T2.1)                    |
| SheetJS                | 0.20.3 vendorizado                       | ver ADR-0003                                                           |
| Vitest                 | 5.0                                      | vía `@angular/build:unit-test` (jsdom)                                 |
| Playwright             | 1.63                                     | Chromium, Firefox, WebKit y Pixel 7                                    |
| Fuentes                | `@fontsource/roboto`, `material-symbols` | autoalojadas: sin Google Fonts                                         |

**Capas** (`src/app/`), con alias de TypeScript (`@domain/*`, `@data/*`…) y fronteras impuestas
por ESLint (`no-restricted-imports`, verificado por `npm run lint:boundaries`):

```
features ──► data ──► workers (solo contratos de mensajes)
   │          │          │
   ├──► core  │          │
   ├──► shared│          │
   └──────────┴──────────┴──► domain  (TS puro, sin dependencias)
```

| Capa       | Puede importar                     | No puede importar                                        |
| ---------- | ---------------------------------- | -------------------------------------------------------- |
| `domain`   | solo otros ficheros de `domain`    | Angular, RxJS, SQLite, SheetJS, cualquier otra capa      |
| `workers`  | `domain`, SQLite, SheetJS          | Angular, RxJS, `core`, `data`, `features`, `shared`      |
| `data`     | `domain`, `workers`, `core`        | `features`, `shared`, SheetJS                            |
| `core`     | `domain`, `data`                   | `features`, `workers`, SQLite, SheetJS                   |
| `shared`   | `domain`, `core`                   | `data`, `features`, `workers`, SQLite, SheetJS           |
| `features` | `core`, `data`, `domain`, `shared` | `workers`, SQLite, SheetJS, otras `features` (vía alias) |

## Consecuencias

- El dominio se prueba sin navegador; umbral de cobertura del 90 % en `vitest.config.mts`.
- Todo acceso a SQLite y a ficheros bancarios ocurre fuera del hilo principal.
- Una feature no puede depender de otra: lo común se extrae a `shared` o `domain`.
