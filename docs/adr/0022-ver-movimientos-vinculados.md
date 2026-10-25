# ADR-0022: Desde un movimiento vinculado se ven solo él y los vinculados con él

- **Estado:** aceptado
- **Fecha:** 2026-10-25

## Contexto

Un movimiento puede estar vinculado con otros: un gasto con los ingresos que lo devuelven
(ADR-0021), un ingreso con los gastos que devuelve (entero, desde sus submovimientos o a los
submovimientos del gasto, ADR-0019) y cada pata de un traspaso con la otra. En la tabla, el gasto
ya enseña debajo sus devoluciones, pero el ingreso solo llevaba la etiqueta «Reembolso» y las patas
de un traspaso la de «Traspaso», sin decir con qué movimiento.

El movimiento vinculado puede no estar a la vista: lo esconden los filtros o la búsqueda, o queda
fuera de las filas pintadas. Por eso se descartó desplazarse hasta su fila y resaltarla.

## Decisión

- Cada `TransactionRow` lleva sus `links`: el otro movimiento, el tipo de vínculo
  (`refundedBy`, `refunds`, `transfer`), su fecha, concepto, cuenta e importe (lo devuelto entre
  los dos o, en un traspaso, el de la otra pata). Lo repartido a una subcategoría sin gasto
  (ADR-0013) no enlaza con ningún movimiento.
- En la tabla y en las tarjetas, un movimiento vinculado lleva delante del concepto un botón
  `link`. Su título y su nombre accesible dicen con cuáles: «Devuelve: CENA, 10/09/2026, 30,00 €».
- Al pulsarlo, la lista enseña solo ese movimiento y los vinculados con él, por encima de los
  filtros, la búsqueda y el origen del resumen (ADR-0017), con un aviso «Vinculados con: …» que lo
  quita. Buscar, filtrar o cambiar de origen también lo quita: se vuelve a la lista de siempre.
  No cambia la URL.

## Consecuencias

- Se llega al otro movimiento con un clic, esté donde esté, y los filtros guardados no se pierden.
- El foco vuelve al botón del movimiento de partida al entrar y al salir de la vista; los cambios
  se anuncian con el `LiveAnnouncer`.
- Pendiente, si se echa en falta: enseñar debajo del ingreso los gastos que devuelve, como ya se
  hace bajo el gasto con sus devoluciones.
