# ADR-0013: Los reembolsos se reparten entre gastos y subcategorías, y cuentan donde se reparten

- **Estado:** aceptado
- **Fecha:** 2026-10-17

## Contexto

Muchos gastos de casa son compartidos con una sola persona (Sergio): ella paga el gasto entero y
Sergio le devuelve su parte por Bizum o transferencia. En la hoja de cálculo cada devolución va
justo debajo de su gasto («Part proporcional Sergio – Cetelem Dormity», 55,96 € de 111,92 €). La
parte no siempre es la mitad.

El ADR-0005 ya modelaba gastos compartidos (`shared_expenses`) y reembolsos (`reimbursements`,
que enlazan un ingreso con uno o varios gastos), pero:

- Los informes contaban el Bizum entero en su propia categoría y en su mes: para que restara del
  gasto había que clasificarlo a mano en la misma subcategoría y cambiarle la fecha imputada. Si
  devolvía gastos de categorías distintas (la cuota y el seguro), todo caía en una.
- No había forma de asignar un Bizum a lo del día a día (comida, cenas) sin ir ticket por
  ticket.
- Los resúmenes solo daban el neto; la hoja enseña aparte lo gastado y lo devuelto.

## Decisión

- **Un reembolso se reparte en partes.** Cada parte va a **un gasto compartido concreto** o a
  **una subcategoría de gasto**, nunca a los dos (migración 005: `reimbursements` con
  `expense_tx_id` o `category_id`). Los triggers siguen impidiendo repartir más de lo recibido o
  devolver más de lo gastado, y solo admiten subcategorías de tipo `gasto`.
- **Cada parte cuenta donde se reparte** (consultas de `workers/db/queries/reports.ts`):
  - la enlazada a un gasto, en la categoría y el mes del gasto;
  - la repartida a una subcategoría, en esa subcategoría y en el mes del reembolso (el que se
    ajusta con la fecha imputada, si hace falta);
  - en la categoría del reembolso solo queda lo que no se ha repartido.
- **El dinero solo cambia de sitio:** el balance de todos los meses sigue sumando todos los
  movimientos. Ya no hace falta cambiar la fecha imputada del Bizum al enlazarlo, como proponía
  el ADR-0005.
- **Lo devuelto se separa.** Los informes dan, en cada línea, bloque y mes, `reimbursedCents`:
  lo devuelto, ya incluido en el total neto. Lo gastado es el total menos lo devuelto. Las
  devoluciones de una tienda siguen restando del gasto sin contar como devuelto.
- **Pendiente de cobrar** solo cuenta lo enlazado a gastos concretos: lo repartido a una
  subcategoría no devuelve ningún gasto en particular.
- **Una sola persona.** La app es local y sin servidor, así que no hay varios usuarios: quien la
  usa lleva las cuentas y Sergio es la persona con la que comparte gastos (`people`). La interfaz
  no preguntará con quién mientras solo haya una; el modelo admite más.

## Consecuencias

- Borrar el reembolso borra sus partes (el gasto vuelve a quedar pendiente); borrar la
  subcategoría borra lo repartido a ella, que vuelve a contar en la categoría del reembolso.
- Si una subcategoría deja de ser de gasto después de recibir repartos, estos siguen contando en
  ella: lo revalidará la interfaz, no los triggers.
- Pendiente (T5.5): las acciones «Compartir gasto» y «Repartir Bizum» en Movimientos, los
  reembolsos agrupados bajo su gasto, y las líneas de lo devuelto en el Resumen y el Resumen
  anual (pie: gastado, devuelto, gasto neto). Más adelante: reglas para compartir siempre ciertos
  gastos y sugerencias de enlace al importar.
