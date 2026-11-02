# ADR-0030: El nombre de una categoría está en un idioma

- **Estado:** aceptado
- **Fecha:** 2026-11-02
- **Modifica:** ADR-0028

## Contexto

El campo traducible de ADR-0028 ofrecía cuatro opciones: «Por defecto» (el globo) y los tres
idiomas de la interfaz. Con tres idiomas, el usuario no entendía para qué servía un cuarto texto
«por defecto» que no era de ningún idioma, ni si tenía que rellenarlo además del suyo.

Se planteó mostrar «Missing translation: clave» en los idiomas sin traducción, con el nombre por
defecto como clave. Se descartó. La categoría ya tiene una clave, su id, que es lo que usan las
reglas, las sugerencias y los informes. Pedir otra sería pedirle al usuario un concepto de
programador. Además, quien usa la app en un solo idioma vería el aviso en todos los selectores e
informes en cuanto cambiara de idioma.

## Decisión

- **Solo idiomas, sin «por defecto».** El campo ofrece los idiomas de la interfaz, en su orden
  (Español, Català, English), y empieza en el de la interfaz. El nombre se escribe en uno o en
  varios; tiene que haber al menos uno (`nombre-vacio`: «Escribe el nombre al menos en un
  idioma»).
- **El nombre de origen tiene idioma.** `categories.name` es el nombre en `categories.language`
  (migración 010), el idioma en que se escribió. Es el que se ve en los idiomas sin traducción.
  `category_translations` guarda los demás. Una traducción al idioma de origen sobra y no se
  guarda. Las que se escriben igual que el nombre sí se guardan («Moto» en catalán), porque dicen
  que ese idioma está traducido.
- **Qué idioma es el de origen, al guardar** (`sourcedNames`): al editar, el que ya tenía, si
  sigue escrito; si no, o en un alta, el de la interfaz, si está escrito; si no, el primero
  escrito en el orden de los idiomas. Borrar el nombre en su idioma pasa el de origen a otro sin
  perder nada.
- **El contrato del worker** acepta `language` en el alta y en el cambio. Sin él, un alta se
  guarda en `es` (`CATEGORY_SOURCE_LANGUAGE`) y un cambio conserva el idioma que tenía. Así los
  clientes y los tests que no lo envían siguen funcionando.
- **Lo que falta traducir solo se marca en Categorías.** En el resto de la app (selectores,
  informes, movimientos) se ve el nombre de origen sin más. En la tabla de Categorías, una
  categoría sin nombre en el idioma de la interfaz lleva una marca con el código del idioma que
  se ve («EN»), con el texto «Sin traducir: se ve en English» como título y para los lectores de
  pantalla. En el menú del campo, cada idioma vacío dice «Sin traducir», y su campo enseña de
  ejemplo el nombre de origen.
- **Migración de las BD existentes.** Los nombres se dan por escritos en español, salvo que la
  categoría ya tenga traducción al español: entonces su idioma es el primero, en el orden de la
  interfaz, que no traduce. Si traduce todos, su nombre «por defecto» no se veía en ninguno y pasa
  a ser el español (si no lo usa ya una hermana). Las traducciones que repiten el nombre en su
  propio idioma se borran.
- **La plantilla** trae también las traducciones que se escriben igual en catalán («Moto»,
  «Variables»), para que no salgan como sin traducir. Solo traduce las categorías escritas en
  español.

## Consecuencias

- El usuario escribe el nombre en su idioma y no ve ningún concepto extra. Traducirlo es
  opcional.
- Las categorías creadas antes con la interfaz en otro idioma quedan como escritas en español. Se
  corrige editando la categoría: basta con mover el nombre al campo de su idioma.
- La validación de nombres repetidos no cambia (ADR-0028): por idioma, y contando el de origen
  donde no hay traducción.
- Las BD de una versión anterior se migran al abrirlas, también las copias de seguridad.
