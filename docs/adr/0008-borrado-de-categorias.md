# ADR-0008: Borrar una categoría deja sus movimientos sin categoría

- **Estado:** aceptado
- **Fecha:** 2026-10-11

## Contexto

El plan (T4.1) y el ADR-0005 preveían que borrar una categoría exigiera reasignar antes sus
movimientos a otra. Para ordenar las categorías ese paso estorba: lo habitual es querer quitar
una que sobra y decidir después, movimiento a movimiento, dónde va cada uno. La pantalla
«Configuración › Categorías» muestra además cuántos movimientos usa cada categoría, así que el
usuario sabe de antemano qué toca.

## Decisión

Borrar una categoría no exige reasignar: tras confirmarlo en un diálogo que indica cuántos
movimientos tiene asociados, estos **quedan sin categoría** (`category_id = NULL`,
`category_source = 'ninguna'`). Borrar una categoría principal borra también sus subcategorías.
Todo ocurre en una única transacción (`workers/db/queries/categories.ts`).

## Consecuencias

- Ningún movimiento se borra; los afectados aparecen en «Sin categoría» y se pueden volver a
  clasificar.
- Lo demás que apuntaba a la categoría se suelta en la misma transacción: las **reglas** que
  clasificaban hacia ella se eliminan (sin destino no clasifican nada), los préstamos y cargos
  recurrentes quedan sin categoría y sus presupuestos se borran (`ON DELETE CASCADE`).
- Las claves ajenas siguen en `RESTRICT`: el esquema no cambia y un borrado que olvide soltar
  algo falla en vez de dejar datos huérfanos.
- No se puede deshacer; el diálogo lo avisa. Cuando exista el guardado en disco (T2.7–T2.8) la
  copia de seguridad será la vía de recuperación.
- Pendiente: ofrecer en el mismo diálogo «mover los movimientos a otra categoría» como
  alternativa, y avisar de las reglas que se eliminan cuando exista su pantalla (T4.2).
