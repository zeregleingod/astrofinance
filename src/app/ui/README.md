# ui

Piezas visuales reutilizables sin estado de negocio (pipes, navegación de mes y año, diálogos,
estados vacíos…) y todos los textos visibles: los diccionarios de `i18n/` (español, el
predeterminado, inglés y catalán) y `texts.ts`, que da los del idioma elegido y cambia con él (ADR-0027).

- Importa solo `domain`. No importa `services`, `pages` ni `worker`.
