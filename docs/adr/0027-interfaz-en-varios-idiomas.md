# ADR-0027: Interfaz en varios idiomas, con cambio en vivo

- **Estado:** aceptado
- **Fecha:** 2026-11-01

## Contexto

Todos los textos de la interfaz estaban ya en `ui/texts.ts` (es-ES), pero como una constante: se
leían una sola vez, al cargar cada módulo. Se quiere poder elegir el idioma (español, inglés y
catalán, con el español como predeterminado) desde un botón junto al modo oscuro, y que el cambio
se vea al momento, sin recargar. Los nombres de las categorías, los conceptos del banco y demás
datos del usuario no se traducen.

Se descartó `@angular/localize`: compila una aplicación por idioma y cambiar de idioma exige
cargar otra. Recargar la página con el idioma guardado era lo más sencillo, pero se pidió
expresamente el cambio en vivo.

## Decisión

- **Un diccionario por idioma** en `ui/i18n/` (`es.ts`, `en.ts`, `ca.ts`). El español define la forma
  (`Texts`); los demás la cumplen con su tipo, así que si falta o sobra una clave, no compila. Un
  test lo comprueba también en tiempo de ejecución.
- **El idioma es una señal** (`ui/i18n/language.ts`), que se guarda en `localStorage`
  (`astrofinance.language`, sin datos financieros) y se sigue en `<html lang>`.
- **`TEXTS` lee del idioma activo.** Sigue en `@ui/texts` con la misma forma, pero es un `Proxy`:
  cada lectura de un texto consulta la señal. Las plantillas, los `computed` y los `effect` que
  leen un texto se actualizan solos al cambiar de idioma, sin tocar los componentes. Guardar un
  apartado (`const t = TEXTS.imports`) es seguro; guardar un **texto suelto** en una constante o en
  un campo lo congela. Por eso las tablas de textos de módulo usan _getters_, los campos derivados
  son `computed` y los títulos de ruta son funciones (`title: () => TEXTS.dashboard.title`), que
  leen el menú lateral (`computed`) y `AppTitleStrategy` (que vuelve a escribir el título del
  documento al cambiar de idioma).
- **Lo que no sigue a las señales por sí solo:** el pipe `periodLabel` es impuro; el datepicker
  actualiza `MatDatepickerIntl` (con `changes.next()`) y el idioma de su adaptador en un `effect`.
- **Los formatos no cambian.** Importes y fechas se escriben a la española en cualquier idioma
  (`LOCALE_ID` es-ES, `1.234,56 €`, `dd/mm/aaaa`). En inglés el calendario usa `en-GB` solo para
  nombrar los meses y los días (también `dd/mm/aaaa`), y el catalán `ca-ES`.
- **El menú de idioma** está en los accesos rápidos de la barra lateral, junto al modo oscuro:
  cada idioma se nombra en su propia lengua, con `lang`, y la opción activa va marcada
  (`menuitemradio` con `aria-checked`).

## Consecuencias

- Añadir un idioma es crear su diccionario, añadirlo a `LANGUAGES` y a `DICTIONARIES`
  (`ui/texts.ts`) y elegir su `Intl` del calendario (`CALENDAR_LOCALES`).
- Hay que vigilar que ningún texto se copie a una constante o a un campo; un texto congelado se
  queda en el idioma con el que arrancó la pantalla. Los avisos de un momento (una notificación,
  un error) se escriben en el idioma de entonces y no se traducen después.
- Las frases se componen con fragmentos (`${t.deleteQuestion} «${nombre}»?`), así que cada idioma
  tiene que encajar en ese orden. Si un idioma no encaja, habrá que pasar a plantillas con
  huecos. En catalán «de» se apostrofa ante vocal («d'octubre», «d'Oci») y el diccionario no sabe
  qué viene detrás: donde sigue un mes o un nombre del usuario se usan giros sin «de»
  («Extracte: octubre de 2026», «nova subcategoria a la categoria Oci»).
- Las comillas «» y los mensajes internos (errores del worker, migraciones) siguen en español: no
  llegan al usuario o son códigos que la interfaz traduce.
- Los datos de ejemplo de la demo y la plantilla de categorías son datos, no textos de la
  interfaz: siguen en español. Los nombres de las categorías en varios idiomas los decide
  ADR-0028.
