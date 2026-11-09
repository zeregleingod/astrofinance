# ADR-0035: Se trabaja con una cuenta elegida

- **Estado:** aceptado
- **Fecha:** 2026-11-09

## Contexto

Con las cuentas creadas a mano (ADR-0034), la importación seguía buscando la cuenta por banco y
final del IBAN, y si no la encontraba creaba otra. El usuario quiere decidir él a qué cuenta va cada
extracto y llevar varias cuentas por separado. El resumen, los movimientos y la hoja anual mezclaban
todas las cuentas.

## Decisión

- **Una cuenta elegida.** Se elige en un desplegable de la barra lateral, entre los accesos rápidos
  y «Menú» (`AccountSelection`, `pages/shell/account-picker.ts`), con el logotipo del banco de la
  elegida a la izquierda (`ui/bank-logo`; sin logotipo, un icono de banco). Con la barra plegada es un botón
  con el nombre de la cuenta que abre la lista. La elección se guarda en `sessionStorage` (solo el
  id): dura lo que la pestaña. Si la cuenta guardada ya no existe (otra BD, la demo, se ha
  eliminado), se usa la primera por nombre.
- **Sin cuentas en la barra lateral:** el hueco del desplegable se queda, discontinuo y apagado
  («Ninguna todavía»), sin enlaces ni acción; plegada, el mismo icono apagado. Así, al crear la
  primera cuenta el menú no se mueve. A crearla invitan las páginas.
- **Primeros pasos** (`ui/getting-started`): mientras no hay nada que enseñar, el Resumen, el
  Resumen anual y Movimientos (e Importar, mientras no hay ninguna cuenta) muestran de fondo, apagada y oculta a los lectores de pantalla, la
  forma de lo que saldrá (las tarjetas del mes, la hoja de doce meses, la lista, el panel de
  importar), y encima una
  tarjeta con tres pasos: crear la cuenta, importar su extracto y revisar el mes. El título cambia
  con la página. Sin cuenta, el paso activo es el primero y el botón lleva a Configuración ›
  Cuentas; con la cuenta y sin movimientos, el primero sale hecho y el botón lleva a importar.
- **Todo es de esa cuenta.** El resumen del mes, los movimientos, la hoja anual y los meses que se
  ofrecen solo leen sus movimientos. Por ahora no hay vista de todas las cuentas juntas.
- **Importar.** Antes de elegir el fichero se elige la cuenta de destino: es el mismo valor que el
  de la barra lateral, y cambiarlo en un sitio lo cambia en el otro. Sin ninguna cuenta, en lugar
  de elegir el fichero salen los primeros pasos. La importación ya **no crea cuentas**:
  el lote lleva `accountId` y, si la cuenta no existe, falla sin guardar nada. Si la cuenta no sabía
  el final de su IBAN o su saldo inicial, los toma del extracto. Si el extracto es de otro banco que
  la cuenta, se avisa en la revisión, sin impedir guardar.
- **Consultas.** Las consultas de informes reciben la cuenta. La primera expresión del `WITH` se
  llama `transactions` y tapa a la tabla con solo los movimientos de la cuenta, así que el SQL de
  los informes no cambia. Lo que está en otra cuenta se lee de `main.transactions`.
- **Traspasos.** En una cuenta cuentan las dos patas que tenga: la salida en la de origen y la
  entrada en la de destino. Sin cuenta (solo en los tests, de momento) la entrada sigue sin contar.
- **Devoluciones.** Un reembolso cuenta en la cuenta en la que entra el dinero, en la categoría y
  el mes del gasto, aunque el gasto esté en otra cuenta; el gasto sigue entero en la suya. Al
  vincular, solo se ofrecen ingresos de la cuenta del gasto.
- **Sugerencias de categoría** (ADR-0018): aprenden de todas las cuentas; las reglas limitadas a
  una cuenta usan la cuenta de destino.

## Consecuencias

- Hay que crear la cuenta antes de importar su primer extracto.
- La huella de cada movimiento no incluye la cuenta: el mismo extracto subido a dos cuentas solo
  se guarda en la primera, y en la segunda salen todos como ya guardados.
- La columna «Cuenta» de los movimientos repite siempre la misma cuenta; se mantiene por si vuelve
  la vista de todas.
- Pendiente: una vista de todas las cuentas juntas, con los traspasos entre ellas neutralizados.
