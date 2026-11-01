# ADR-0029: Landing de entrada

- **Estado:** aceptado
- **Fecha:** 2026-11-01

## Contexto

Al entrar, la aplicación abría directamente el Resumen con una BD vacía en memoria, y la demo se
abría desde un botón del menú o desde `/demo`. Quien llegaba por primera vez no sabía qué hacía la
aplicación ni que sus datos se guardan en un fichero suyo (ADR-0010). Además, abrir la demo desde
dentro obligaba a esconder el botón en cuanto había datos del usuario, para no perderlos.

## Decisión

- **Sin BD abierta se ve una landing** (`pages/shell/landing-page`) en lugar del armazón de la
  aplicación. Tiene dos botones: «Abrir mi archivo» (un fichero `.db` descargado desde la
  aplicación) y «Ver la demo». Debajo, un enlace discreto «Empezar sin datos» abre la BD vacía con
  la plantilla de categorías, para quien todavía no tiene fichero.
- **La URL no cambia.** `App` elige entre la landing y el armazón con `LandingGate.inside`; si se
  llega a `/movimientos` sin BD, se ve la landing y, al entrar, se está en Movimientos.
- **Se entra cuando la landing termina de abrir**, no en cuanto la BD está lista: cargar un fichero
  abre antes una BD vacía para comprobarlo (`DbService.restore`), que no debe asomar si el fichero
  no vale. Si falla, se cierra la BD, se explica el error bajo los botones y se sigue en la
  landing. Desde la landing no se pregunta antes de cargar: no hay datos que perder.
- **La demo solo se abre desde la landing.** Se quitan la ruta `/demo` (ahora lleva al inicio) y
  el botón «Ver la demo» del menú. Al salir de la demo se cierra la BD y se vuelve a la landing.
- **Diseño:** el del resto de la aplicación (Poppins, añil, superficie lavanda, modo oscuro). A la
  izquierda, el titular, una frase y las acciones. A la derecha, la tarjeta del último mes de la
  demo dentro de la órbita del logo, que enseña qué hace la aplicación antes de entrar. Sus cifras
  son fijas (`demo-preview.ts`), porque en la landing no hay BD; un test de `demo-data.spec.ts`
  comprueba que siguen siendo las de la demo. Para los lectores de pantalla la tarjeta es una
  imagen con su descripción. Al cargar, el anillo se traza y la tarjeta se posa, salvo con
  `prefers-reduced-motion`.
- **Idioma y tema** se cambian también desde la landing, con los mismos botones que la barra
  lateral (`PreferenceButtons`). El título de la pestaña es solo «AstroFinance».

## Consecuencias

- Recargar la página vuelve a la landing: los datos viven en memoria hasta que exista el guardado
  en disco (T2.7–T2.8). Los e2e entran con `openDemo` y `startEmpty` (`e2e/fixtures.ts`).
- El código de las páginas que abría una BD vacía si no había ninguna (Categorías, Reglas,
  Importar) ya no se alcanza desde la aplicación; se conserva como red de seguridad.
- La landing se carga con la aplicación, no de forma _lazy_: es la primera pantalla.
