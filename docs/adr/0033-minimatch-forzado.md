# ADR-0033: `minimatch` 11 forzado con `overrides`

- **Estado:** aceptado
- **Fecha:** 2026-11-02

## Contexto

`npm audit` avisaba de 19 vulnerabilidades moderadas que salían todas de una sola:
`minimatch < 11.0.1` (denegación de servicio por amplificación de patrones,
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)). Solo lo usan ESLint
(`eslint`, `@eslint/config-array`) y `@typescript-eslint/typescript-estree`: herramientas de
desarrollo que no llegan al build. Ninguna versión publicada acepta aún `minimatch` 11 (piden
`^10`), y `npm audit fix --force` proponía bajar `typescript-eslint` a la 8.14.

## Decisión

Forzar `"minimatch": "11.0.4"` en `overrides` de `package.json`, como ya se hace con `vite`. La 11
exporta lo mismo que la 10 (CommonJS y ESM con `minimatch`); solo deja de soportar Node 18, y el
proyecto usa Node 24.

## Consecuencias

- `npm audit` queda limpio y `npm run ci` pasa entero (lint y `lint:boundaries` incluidos, que
  son los que usan `minimatch` para casar los ficheros con la configuración).
- Quitar el override cuando ESLint y `typescript-eslint` acepten `minimatch` 11 por sí mismos
  (`npm ls minimatch` sin `overridden`).
