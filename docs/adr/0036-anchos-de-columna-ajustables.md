# ADR-0036: Anchos de columna ajustables en Movimientos

- **Estado:** aceptado
- **Fecha:** 2026-11-09

## Contexto

La tabla de Movimientos reparte el ancho con valores fijos (ADR-0020). Desde que todo es de una
cuenta (ADR-0035) la columna Cuenta repite siempre el mismo nombre y tenía un 13 % del ancho,
mientras que Observaciones, con un 9 %, se cortaba enseguida. Además, cada persona lee unas
columnas más que otras y quiere poder darles el ancho que necesita.

## Decisión

- **Anchos por defecto:** Cuenta pasa del 13 % al 10 % y Observaciones del 9 % al 14 %. La
  descripción sigue quedándose con lo que sobra.
- **Arrastrar el borde derecho de una cabecera** cambia el ancho: lo que gana esa columna lo pierde
  la de al lado, así que la tabla siempre ocupa justo su caja y el resto de columnas no se mueve. Si
  una de las dos es la descripción, no se le fija ancho: crece o mengua sola. Ninguna baja de su
  mínimo (la descripción, 160 px; la fecha y el importe, lo que necesitan para no recortarse; el
  resto, 64 px). La lógica es pura y está probada aparte (`pages/transactions/column-widths.ts`).
- **La última columna no tiene borde:** a su derecha van las acciones, de ancho fijo.
- **Teclado y lectores de pantalla:** cada borde es un separador enfocable (`role="separator"`,
  con su ancho en `aria-valuenow`). Las flechas lo mueven 16 px. Inicio, o un doble clic en
  cualquier borde, devuelve todas las columnas a los anchos de siempre. Cada cabecera se nombra
  solo por su texto (`aria-labelledby`), sin el del borde.
- **Convive con reordenar** (arrastrar la cabecera): al agarrar el borde no empieza el arrastre de
  la columna ni se ordena por ella. Los anchos van con cada columna aunque cambie de sitio.
- **Se recuerdan en este navegador** (`localStorage`, `astrofinance.movimientos.anchos`): solo un
  número por columna, sin datos financieros. Lo que no tiene buena forma se descarta.
- **Cómo se aplican:** como variables CSS en la página (`--col-<columna>-width`), con el ancho de
  siempre como valor por defecto en la hoja de estilos; la plantilla no lleva estilos en línea.

## Consecuencias

- Con una ventana más estrecha que la suma de los anchos fijados, la descripción se queda en su
  mínimo y lo demás se recorta; doble clic en un borde lo devuelve a los anchos de siempre.
- El orden de las columnas sigue sin recordarse entre visitas, a diferencia de los anchos.
- En el móvil no hay tabla (fichas, ADR-0015), así que no hay nada que redimensionar.
