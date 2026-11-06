# ADR-0023: Vista detallada de movimientos

- **Estado:** aceptado
- **Fecha:** 2026-10-27

## Contexto

La tabla compacta (ADR-0020) enseña muchos movimientos de un vistazo, pero a costa de recortar:
el concepto, la categoría y las observaciones se leen enteros solo en el título; de las etiquetas
cabe una; los vínculos (ADR-0022) y la fecha original solo están en un título, y el concepto del
banco no se ve en ningún sitio. Para repasar los movimientos con calma hace falta verlo todo sin
pasar el ratón por encima.

## Decisión

- **Selector «Compacta / Detallada»** arriba a la derecha de Movimientos, solo cuando cabe la
  tabla. Siempre se empieza por la compacta; la elección no se guarda todavía (más adelante el
  usuario podrá fijar la vista por defecto en los ajustes).
- **La vista detallada no es una tabla:** es la lista de tarjetas de móvil, una por movimiento y
  sin agrupar, con más aire y letra más grande en escritorio. El orden se elige en el mismo
  desplegable que en móvil; las columnas no se reordenan porque no las hay.
- **Las tarjetas enseñan, también en móvil,** el concepto del banco cuando el usuario lo ha
  cambiado y los vínculos con su texto a la vista. Los «devuelto por» no se repiten: ya salen en
  la lista de devoluciones debajo del gasto.

- **Diseño de la ficha: tres zonas, «cuándo, qué y cuánto»** (revisado el 2026-11-06, elegido
  entre tres maquetas de 3 columnas: cuadrícula de fichas, ficha en tres columnas y mosaico
  compacto; sustituye al de app bancaria del 2026-10-27).
  - **Cuándo:** la fecha (día grande, mes y año), el día de la semana y la cuenta, sobre un fondo
    tintado; si la fecha se imputó a otra, el tinte es el terciario.
  - **Qué:** el concepto, la categoría con un punto de su color y las etiquetas; debajo, el
    concepto del banco, la nota, la fecha original y los vínculos (término y valor, con icono), y
    los «Submovimientos» y «Devoluciones» como una tabla con borde.
  - **Cuánto:** el importe grande y las acciones **con su nombre** («Devoluciones», «Dividir»,
    «Editar»), una debajo de otra y «Editar» destacada.
  - En la vista detallada las tres zonas son columnas (200 px, el resto y 240 px). En móvil se
    apilan: arriba la fecha y el importe, luego el concepto con sus detalles y, al pie, las
    acciones en fila.

## Consecuencias

- Una sola plantilla para móvil y vista detallada: lo que se añada a las tarjetas sirve para las
  dos.
- Cuando exista la preferencia de vista, bastará con inicializar `density` en
  `TransactionsPage` desde ella.
