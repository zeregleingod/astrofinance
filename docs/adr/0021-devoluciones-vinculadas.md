# ADR-0021: Devoluciones: se vinculan ingresos a un gasto, sin tener que compartirlo

- **Estado:** aceptado
- **Fecha:** 2026-10-22

## Contexto

Es habitual pagar un gasto entero y que otros devuelvan su parte después: se paga la cena del
restaurante y cada amigo hace un Bizum con lo suyo. El ADR-0013 ya modelaba los reembolsos
(`reimbursements`: un ingreso repartido entre gastos y subcategorías), pero no tenía interfaz, y
para enlazar un ingreso a un gasto exigía que el gasto estuviera **compartido con una persona**
(`shared_expenses`, con una sola persona y una parte esperada). En una cena con varios amigos no
hay una sola persona, y para decir «este Bizum devuelve esta cena» no hace falta saber de quién es.

Se descartó hacerlo con submovimientos (ADR-0019): un submovimiento divide un movimiento por
dentro; una devolución relaciona dos movimientos distintos, cada uno con su línea del extracto.

## Decisión

- **Una devolución es la parte de un ingreso enlazada a un gasto** (o a un submovimiento de gasto):
  basta con que el destino sea un gasto. Compartir (`shared_expenses`, `shared_person_id`) pasa a
  ser opcional y solo sirve para lo pendiente de cobrar. En la migración 007 (aún sin publicar),
  `reimbursements.expense_tx_id` apunta a `transactions` y no a `shared_expenses`, y dejar de
  compartir ya no borra las devoluciones.
- **Las cuentas no cambian** (ADR-0013): lo devuelto cuenta en la categoría y el mes del gasto y
  se separa como «devuelto»; el gasto cuesta lo que queda. Si el gasto está dividido, se reparte
  en proporción (ADR-0019).
- **Un ingreso se puede repartir entre varios gastos** y un gasto puede tener varios ingresos: lo
  que un ingreso devuelve en total nunca pasa de su importe, ni lo devuelto de un gasto del suyo.
- **Una devolución sale de un ingreso entero o de uno de sus submovimientos**
  (`reimbursements.reimbursement_split_id`). Así se reparte un ingreso entre varios gastos: el Bizum
  general de suministros se divide en luz, agua y gas (ADR-0019), y cada factura se vincula con su
  parte («BIZUM SUMINISTROS › LUZ»). Cada parte devuelve como mucho lo que vale, y lo no dividido
  del ingreso también puede devolver algo.
- **En Movimientos**, cada gasto tiene la acción «Vincular devoluciones» («Editar devoluciones» si
  ya tiene). El diálogo enseña el gasto, una barra con lo devuelto y lo que cuesta de verdad, los
  ingresos vinculados con su importe y, debajo, los ingresos que se pueden añadir (cada uno en una
  fila blanca).
  - **El importe no se escribe:** un ingreso se vincula por su importe (o por lo que tiene libre,
    si ya devuelve parte de otro gasto). Las devoluciones ya guardadas conservan el suyo.
  - **Qué se ofrece:** lo no dividido de cada ingreso y cada submovimiento de un ingreso, si tienen
    algo libre que cabe en lo que falta por devolver; primero los posteriores al gasto (las
    devoluciones llegan después), del más cercano al más lejano, y hay un buscador. No se ofrece la
    entrada de un traspaso, que no cuenta en los informes.
  - **Guardar** sustituye las devoluciones del gasto de una vez (`saveRefunds`); lo que esos
    ingresos devuelven de otros gastos o subcategorías no se toca.
- **Debajo de cada gasto** van sus devoluciones (fecha, concepto e importe en verde), como los
  submovimientos. La búsqueda encuentra el gasto también por el concepto de sus devoluciones.

## Consecuencias

- La tabla tiene tres acciones por fila (devoluciones, dividir y editar): sus botones son de 28 px.
- Un ingreso que devuelve dos gastos (un Bizum de 50 € por la cena y por el taxi) se divide primero
  en submovimientos, uno por gasto, y cada gasto se vincula con su parte.
- Pendiente (T5.5): compartir con personas y lo pendiente de cobrar por persona, y repartir un
  ingreso entre gastos y subcategorías desde la interfaz.
