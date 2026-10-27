# ADR-0019: Submovimientos: un movimiento se divide en partes que cuentan cada una en su categoría

- **Estado:** aceptado
- **Fecha:** 2026-10-22

## Contexto

Un mismo cargo puede mezclar cosas de categorías distintas: en una tienda se compran cosas para
el piso y un regalo, y el banco da un único movimiento con un único importe. Hasta ahora el
movimiento entero contaba en una sola subcategoría. A veces, además, solo una de esas partes es a
medias con la otra persona (lo del piso), que devuelve su parte por Bizum.

Los movimientos son el registro del extracto (ADR-0016): su importe, su fecha original y su
concepto del banco no se cambian, y la detección de duplicados, la comprobación de saldos y las
reglas cuentan con que cada fila de `transactions` es una línea del extracto.

## Decisión

- **Submovimientos en una tabla propia** (`transaction_splits`, migración 007), enlazados al
  movimiento padre. No son filas de `transactions`: no entran en duplicados, saldos, lotes ni
  reglas. Un movimiento puede tener **cualquier número** de submovimientos.
- **Cada submovimiento** tiene concepto (**obligatorio**, en mayúsculas como los del banco),
  subcategoría (o ninguna) e importe, con **el mismo signo** que el padre. No tiene fecha propia:
  cuenta en el mes del padre, incluida su fecha imputada.
- **No se divide más de lo que hay.** La suma de los submovimientos no puede superar el importe
  del padre; lo garantizan el dominio (`domain/transactions/transaction-split.ts`) y los
  disparadores de la BD.
- **Lo que no se divide se queda en el padre.** En los informes el padre cuenta solo el resto
  sin dividir, en su categoría; si está dividido entero no aporta nada y desaparece de las líneas
  del resumen. El dinero solo cambia de categoría: el balance del mes no cambia nunca al
  dividir. Es la misma regla que la de los reembolsos repartidos (ADR-0013).
- **Un submovimiento de gasto puede recibir devoluciones** (`reimbursements.expense_split_id`,
  que se suma a los destinos del ADR-0013: un gasto, una subcategoría o un submovimiento, siempre
  uno solo); no hace falta compartirlo (ADR-0021). Esa parte cuenta en la subcategoría y el mes
  del submovimiento. **Se puede además compartir** con una persona y una parte esperada
  (`shared_person_id`, `shared_expected_cents`): lo que falte por devolver suma en lo pendiente
  de cobrar del mes.
- **Cualquier movimiento se divide**, venga de donde venga: un gasto compartido, las dos patas
  de un traspaso o un ingreso que ya devuelve gastos. Para que cada euro cuente en un solo sitio:
  - lo dividido más lo que el movimiento devuelve con lo no dividido (ADR-0021) no pasa de su
    importe, y el diálogo solo reparte lo que queda libre;
  - los submovimientos de la entrada de un traspaso no cuentan en los informes, como ella.

  **Enmienda (2026-10-27):** en la práctica, dividir un movimiento ya vinculado (un traspaso o
  una devolución, ADR-0022) acababa en un diálogo que no dejaba guardar. Ahora «Dividir» se
  desactiva en los movimientos vinculados que no tienen submovimientos, con el motivo en su
  título y en su nombre accesible («No se puede dividir un movimiento vinculado»). Sigue
  enfocable (`disabledInteractive`) para que se pueda leer. Si ya tenía submovimientos, se pueden
  seguir editando. Para repartir un ingreso entre varios gastos, primero se divide y luego se
  vincula cada parte.

- **Un submovimiento de un ingreso puede ser una devolución** (ADR-0021): el Bizum de suministros
  dividido en luz, agua y gas devuelve cada factura con su parte. Cuenta neto de lo que devuelve, y
  en la lista lleva la etiqueta «Devuelve» con los gastos que devuelve.
- **Bizum de un gasto compartido entero que luego se divide:** se reparte en proporción a cada
  submovimiento y al resto sin dividir (si devuelven la mitad, devuelven la mitad de cada cosa).
  Se trunca a céntimos y lo que sobra del redondeo va al resto o, si no queda resto, al último
  submovimiento. Lo pendiente de cobrar sigue siendo del gasto entero.
- **Lo compartido se cobra una sola vez:** un gasto se comparte entero o por submovimientos,
  nunca de las dos formas (lo impiden los disparadores en los dos sentidos).
- **Guardar los submovimientos** sustituye la lista del movimiento de una vez (`saveSplits`): los
  que siguen conservan su id (y con él lo compartido y lo devuelto), los nuevos se dan de alta y
  los que faltan se borran. Una lista vacía deja el movimiento sin dividir.
- **En Movimientos**, cada movimiento tiene una acción «Dividir en submovimientos» («Editar
  submovimientos» si ya los tiene). El diálogo enseña arriba el movimiento y una barra con lo
  repartido; debajo, una fila por submovimiento (concepto, subcategoría e importe, sin signo,
  como el total) y una última fila fija con el «Resto sin dividir» y dónde se queda. En pantallas
  estrechas cada campo va en su línea para que no se corten los nombres. Debajo de cada
  movimiento dividido van sus submovimientos. Los filtros por categoría y subcategoría y la búsqueda encuentran el movimiento
  también por sus submovimientos, y la etiqueta «Dividido» lo señala.

## Consecuencias

- Borrar el movimiento (p. ej. al revertir un lote) borra sus submovimientos, y con ellos lo
  compartido y lo devuelto a ellos. Borrar una subcategoría deja sin categoría a sus
  submovimientos, como a los movimientos (ADR-0008).
- Las reglas y las sugerencias del historial solo clasifican el padre: el resto sin dividir.
  Los submovimientos son siempre decisión del usuario.
- El importe del padre no se edita (ADR-0016), así que los submovimientos no pueden quedar
  descuadrados después.
- Pendiente (T5.5): la interfaz para compartir y repartir Bizum, que servirá igual para
  movimientos y submovimientos. Hoy el modelo y los informes ya los admiten.
