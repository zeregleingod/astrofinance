# domain

Reglas de negocio en TypeScript puro, agrupadas por concepto: dinero, fechas, categorías, reglas,
importación, informes, movimientos, sugerencias, copias de seguridad.

- No importa `@angular/*`, `rxjs`, SQLite ni ninguna otra carpeta.
- Sin APIs de navegador: debe ejecutarse tal cual en Node y en un Worker.
- TDD estricto; cobertura ≥ 90 % (umbral en `vitest.config.mts`).
