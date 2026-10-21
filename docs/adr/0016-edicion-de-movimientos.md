# ADR-0016: Edición de movimientos en un diálogo; lo que viene del banco no se cambia

- **Estado:** aceptado
- **Fecha:** 2026-10-21

## Contexto

La pantalla «Movimientos» era de solo lectura: un movimiento importado con el concepto críptico
del banco, sin categoría o imputado al mes equivocado (el Bizum de marzo que devuelve un gasto de
febrero) solo se podía corregir en la revisión de la importación, antes de guardarlo. El plan
(T5.2) prevé la edición de movimientos con validación.

La lista tiene dos plantillas (tabla en escritorio, tarjetas por debajo de 1280 px, ADR-0015) y
la tabla tiene columnas que se ordenan y se reordenan arrastrando, así que editar en la propia
fila obligaría a duplicar los editores y a convivir con el arrastre.

## Decisión

- **Un diálogo** (`features/transactions/transaction-edit-dialog`) que se abre con el botón de
  lápiz de cada fila de la tabla (última columna, fuera de las que se ordenan y mueven) o de cada
  tarjeta. El botón nombra el movimiento («Editar movimiento: concepto, fecha»). Al cerrar, el
  foco vuelve a él; al guardar, la lista se recarga y se anuncia «Movimiento guardado».
- **Qué se edita:** el concepto visible, la **fecha imputada** (la que decide el mes; volver a la
  original la deja sin imputar, `booked_date = NULL`), la **subcategoría** (o ninguna) y las
  **observaciones**.
- **Qué no se edita:** el importe, la fecha original, la cuenta y el concepto del banco. Son el
  registro del extracto: los usan la detección de duplicados, la comprobación de saldos y las
  reglas (ADR-0007, ADR-0011). El diálogo los enseña para saber qué movimiento es y ofrece
  «Volver al concepto del banco» y «Usar la fecha original».
- **Categoría y reglas:** elegir otra categoría la marca como manual (`manual` en
  `category_source`, sin `rule_id`), así que las reglas ya no la tocan; dejarla sin categoría la
  pone en `ninguna`. Si la categoría no cambia, conserva su origen (una regla sigue pudiendo
  actualizarla). Solo se ofrecen subcategorías (ADR-0009); si el movimiento estaba en una
  principal (datos antiguos), esa también aparece para no perderla al guardar otra cosa.
- **Validación** en una función pura (`domain/transactions/transaction-edit.ts`) que usan la
  pantalla y el worker: concepto obligatorio de 500 caracteres como máximo, fecha que exista,
  observaciones de 500 como máximo. El worker además comprueba que el movimiento existe y que la
  categoría es una subcategoría, y guarda todo en una transacción.

## Consecuencias

- Un movimiento editado sigue siendo el mismo para la deduplicación: reimportar el extracto no lo
  duplica ni deshace los cambios.
- Cambiar la fecha imputada mueve el movimiento de mes en el Resumen y el Resumen anual.
- Pendiente del resto de T5.2: dar de alta movimientos a mano (en ellos sí se podrán editar el
  importe y la fecha original) y borrarlos. Y T5.3, la edición de varios a la vez.
