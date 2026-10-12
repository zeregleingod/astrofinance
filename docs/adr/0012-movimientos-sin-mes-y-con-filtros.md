# ADR-0012: La lista de movimientos deja de ser mensual y se acota con filtros

- **Estado:** aceptado
- **Fecha:** 2026-10-12

## Contexto

La pantalla «Movimientos» enseñaba un mes cada vez, con el mismo selector de mes que el Resumen.
Para buscar un movimiento sin saber de qué mes es, o para ver todo lo de una categoría o una
cuenta, había que ir mes a mes. El plan (T5.1) ya preveía filtros por fecha, categoría e importe.

## Decisión

- **Todos los movimientos.** La página carga la lista completa (`allTransactions`) y deja de tener
  selector de mes. El Resumen sigue siendo mensual.
- **Filtros** en un bloque propio encima del buscador (`features/transactions/transaction-filters`):
  año, rango de fechas, etiqueta, categoría, subcategoría, cuenta e importe mínimo y máximo. Un
  campo vacío no filtra y todos se combinan con «y».
- **Se aplican al pulsar «Filtrar»**, no al cambiar un campo; «Limpiar» los quita todos. Los dos
  botones van a continuación del último filtro, en su misma fila.
  El buscador de texto sigue filtrando al escribir, sobre lo que dejan los filtros.
- **Dónde se filtra:** en el hilo principal, con una función pura
  (`domain/reports/transaction-filter.ts`) sobre la lista ya cargada, igual que la búsqueda y el
  orden. Los desplegables ofrecen solo lo que aparece en algún movimiento.
- **Fechas y año** se refieren a la fecha imputada, la de la columna «Fecha». «Desde» y «Hasta»
  usan el selector de fecha de Material: se elige en el calendario o se escribe `dd/mm/aaaa`
  (`shared/dates/es-datepicker.ts` adapta el formato, que el adaptador nativo leería como
  mes/día, y pone los textos en español).
- **El importe se compara sin signo:** «entre 50 y 100» vale para gastos e ingresos.
- **Subcategoría** se identifica junto a su categoría, porque los nombres se repiten entre
  categorías; al elegir categoría, el desplegable solo ofrece las suyas.
- **Listas largas:** la tabla pinta 200 filas y un botón «Mostrar más movimientos» añade otras 200. El recuento de la cabecera es siempre el de todos los que cumplen.
- **La tabla llega hasta el final de la ventana** y la página no se desplaza: se desplazan las
  filas dentro de la tabla, con la cabecera fija y su propia barra de desplazamiento. Para ello lo que se desplaza en toda la aplicación pasa a ser `main`, y la
  barra superior y el aviso de demo se quedan arriba. En ventanas bajas la tabla conserva 240 px
  y vuelve a desplazarse la página.
- **`?mes=AAAA-MM`** se conserva como atajo: equivale a filtrar por las fechas de ese mes. Lo usa
  el enlace «Ver los movimientos» tras importar un extracto.

## Consecuencias

- Cargar y ordenar todo en memoria es sencillo y suficiente para unos miles de movimientos. Si la
  lista crece mucho habrá que pasar el filtro y la paginación a SQL y usar _virtual scroll_
  (T5.1).
- Los filtros no se guardan en la URL ni se recuerdan al salir de la página.
- No se puede filtrar solo gastos o solo ingresos por importe; para eso están la categoría y el
  orden por la columna «Importe».
