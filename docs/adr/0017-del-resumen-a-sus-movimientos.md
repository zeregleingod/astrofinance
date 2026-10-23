# ADR-0017: De cada total del resumen a los movimientos que lo forman

- **Estado:** aceptado
- **Fecha:** 2026-10-21

## Contexto

Los totales de arriba del Resumen (Ingresos, Gastos, Ahorro, Balance y Pendiente de cobrar) son
cifras sin explicación: no hay forma de ver qué movimientos las forman. Además no salen de sumar
los movimientos del mes tal cual: con el ADR-0013 un reembolso cuenta en la categoría y el mes del
gasto que devuelve, aunque llegue en otro mes, y lo repartido a una subcategoría cuenta en ella.
Unos filtros de Movimientos por fechas y tipo de categoría no cuadrarían con la cifra.

## Decisión

- Cada total es un enlace a `/movimientos?mes=AAAA-MM&origen=<total>`, con `origen` uno de
  `ingresos`, `gastos`, `ahorro`, `balance` o `pendiente` (`@domain/reports/summary-origin`). Toda
  la tarjeta se puede pulsar; el nombre del enlace es la cifra y su descripción, «Ver sus
  movimientos».
- El worker calcula los movimientos de cada total con las mismas reglas que el resumen
  (`summaryTransactionIds`): cada movimiento del mes con algo sin repartir, cada Bizum enlazado a
  un gasto del mes y cada Bizum del mes repartido a una subcategoría, según el tipo de la
  categoría en la que cuentan (sin las archivadas). Balance es todo eso sin mirar el tipo.
  Pendiente de cobrar son los gastos compartidos del mes a los que aún les falta algo por
  devolver.
- En Movimientos, el origen es un filtro aparte de los del formulario: no se acota por fechas
  (habría que dejar fuera los Bizums de otro mes) y se ve en una línea bajo los filtros,
  «Del resumen: Gastos de septiembre de 2026», con un botón para quitarlo. Los demás filtros y la
  búsqueda se aplican encima.

## Consecuencias

- La lista contiene exactamente los movimientos que entran en la cifra, también los de otros
  meses. Cada fila sigue enseñando el importe entero del movimiento: un Bizum repartido aparece
  con todo su importe, aunque a la cifra solo aporte una parte.
- `?mes=` sin `origen` (o con un `origen` desconocido) sigue filtrando por las fechas del mes.
- Quitar el origen no cambia la URL: al recargar la página vuelve a aplicarse.
