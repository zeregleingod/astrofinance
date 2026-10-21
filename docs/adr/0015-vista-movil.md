# ADR-0015: Vista móvil de las tablas

- **Estado:** aceptado
- **Fecha:** 2026-10-19

## Contexto

Las tablas están pensadas para escritorio: la de movimientos mide 1200 px, la de revisión del
extracto 1240 px y la de reglas 640 px. En un móvil solo se veían dos columnas, había que
desplazarse en horizontal para todo, el panel de filtros ocupaba la pantalla entera y en
Categorías los botones dejaban al nombre sin sitio (se partía letra a letra). En el Resumen anual
la columna de categoría se comía media pantalla.

## Decisión

Un único corte, el del menú lateral (`width < 840px`), expuesto como la señal
`Viewport.compact` en `core/layout/viewport.ts`; las hojas de estilo usan la misma media query.
Por debajo:

- **Movimientos**: los filtros plegados tras un botón (se pliegan al aplicarlos), junto a la
  búsqueda.
- **Reglas**, su **vista previa** e **Importar**: la misma tabla, pero cada fila se coloca como una
  tarjeta con CSS (`display: grid` en `tr`). Se conservan las celdas, los ids a los que vuelve el
  foco y la edición en la fila; la cabecera queda oculta solo a la vista. Los campos que no se
  entienden sin su cabecera la repiten con `data-label`.
- **Categorías**: el tipo pasa debajo del nombre (y su desplegable, al editar, a la celda del
  nombre).
- **Resumen anual**: sigue siendo una hoja que se desplaza en horizontal, pero cada categoría va en
  una fila propia encima de sus subcategorías y los nombres largos saltan de línea.

### Movimientos: se desplaza la página, no la tabla

En todos los tamaños la búsqueda y los filtros van en una barra compacta (campos de densidad -4,
la búsqueda en el mismo flujo que los filtros) que se queda arriba (`position: sticky`) al
desplazar la página; la cabecera de la tabla se queda justo debajo. Su posición depende del alto
de la barra, que cambia al saltar de línea los filtros: se mide con un `ResizeObserver` y se pasa
como `--toolbar-height`.

Con la página desplazándose en vertical, la tabla no puede desplazarse en horizontal dentro de su
recuadro (la cabecera dejaría de quedarse fija), así que tiene que caber: se ve desde 1280 px
(`Viewport.wide`); por debajo, una lista de tarjetas (`TransactionCards`) con el orden en un
desplegable y un botón de dirección, porque sin tabla no hay cabeceras que pulsar.

## Consecuencias

- La lista de movimientos tiene dos plantillas: un cambio en las columnas hay que llevarlo también
  a las tarjetas.
- Por debajo de 1280 px no se reordenan las columnas de la tabla de movimientos (no hay tabla).
- La tabla de movimientos es más estrecha que antes (ya no tiene un mínimo de 1200 px): a 1280 px
  los textos largos se recortan antes con «…» (el texto entero sigue en `title`).
- Los e2e que comprueban la tabla de escritorio se saltan en el proyecto `mobile`;
  `e2e/mobile.spec.ts` comprueba que ninguna página se sale por los lados y las tarjetas. Los que
  solo leen datos usan `movements` de `e2e/fixtures.ts`, que vale para las dos vistas.
- Las hojas de estilo de Importar, Categorías y Reglas superan el aviso de 4 kB del presupuesto
  (no el error de 8 kB).
