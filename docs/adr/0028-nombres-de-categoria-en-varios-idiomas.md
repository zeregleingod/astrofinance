# ADR-0028: Nombres de categoría en varios idiomas

- **Estado:** aceptado; modificado por ADR-0030 (el nombre por defecto pasa a ser el nombre en
  su idioma de origen, y el campo deja de ofrecer «Por defecto»)
- **Fecha:** 2026-11-01

## Contexto

La interfaz ya cambia de idioma en vivo (ADR-0027), pero las categorías son datos del usuario y
se veían siempre con el nombre que se escribió. Se quiere que cada categoría pueda tener su nombre
en cada idioma de la interfaz y que se vea el del idioma elegido. Las reglas, las sugerencias por
historial (ADR-0018) y los informes trabajan con el id de la categoría, no con su nombre.

## Decisión

- **Nombre por defecto y traducciones opcionales.** `categories.name` sigue siendo el nombre por
  defecto: el que se escribe al crearla, en el idioma que sea, y el que se ve en los idiomas sin
  traducción. Las traducciones van en una tabla aparte (migración 009):
  `category_translations (category_id, language, name)`, con clave por categoría e idioma, el
  mismo límite de 60 caracteres y `ON DELETE CASCADE`. Se eligió una tabla frente a una columna
  JSON porque SQLite la valida (`CHECK`, clave, borrado en cascada) y las consultas la unen sin
  funciones de JSON.
- **El idioma de las consultas lo decide la interfaz.** Las consultas que devuelven nombres
  (árbol de categorías, opciones del selector, informes mensual y anual, movimientos y
  submovimientos, reglas y su vista previa) toman un `language` y leen las categorías del CTE
  común `localized_categories` (`queries/category-names.ts`): mismas columnas que `categories`,
  con `name` traducido si hay traducción y `default_name` con el de por defecto. Sin idioma
  (`null`, el valor de los tests) se ve el nombre por defecto.
- **El worker guarda el idioma** (`setCategoryLanguage`), no la BD: no se escribe en el fichero ni
  viaja en las copias. `DbService.useCategoryLanguage` lo envía al abrir cada worker y, si cambia,
  repite las consultas subiendo `dataVersion` sin marcar datos del usuario. Un `effect` de
  `app.config.ts` lo sigue a la señal `language` de la interfaz.
- **Validación**, en `domain/categories/category-tree.ts`, igual en la página y en el worker:
  - Las traducciones vacías o iguales al nombre por defecto no se guardan.
  - Ningún nombre puede coincidir, sin distinguir mayúsculas, con el de una hermana **en el mismo
    idioma**, contando el nombre por defecto donde no hay traducción. Error `traduccion-repetida`
    si choca una traducción y `nombre-repetido` si choca el nombre por defecto.
  - Los códigos de idioma son dos letras en minúscula, como los de la interfaz; como mucho 16.
- **Al guardar**, un cambio con `translations` sustituye todas las de la categoría; sin ellas, se
  conservan (como hacían los clientes antiguos del contrato).
- **Un solo campo traducible** (`ui/translatable-input/`), en el alta y al editar una fila. Dentro
  del campo, a la izquierda, un botón elige qué se escribe en él: el nombre por defecto (globo) o
  el de un idioma (su código, `EN`, `CA`…). Su menú (`menuitemradio`) enseña lo que tiene cada uno
  o «Sin traducir», así que se ve qué falta sin abrir nada. En un idioma vacío se ve de ejemplo el
  nombre por defecto. El campo de cada idioma lleva su `lang` y su nombre accesible («Nombre
  (English)»). Los errores de las traducciones salen bajo el campo con el idioma delante, aunque
  no sea el que se ve, y el botón se marca en rojo. Se prefirió a un campo por idioma porque ocupa
  lo mismo con dos idiomas que con diez. El componente no sabe de categorías: lo puede usar
  cualquier texto traducible.
- **En la tabla** cada categoría se ve en el idioma de la interfaz; al editar, el campo empieza en
  el nombre por defecto.
- **La plantilla y la demo** traen sus categorías en inglés y en catalán
  (`CATEGORY_TEMPLATE_TRANSLATIONS`), cargadas con `INSERT OR IGNORE` para poder repetirlas.

## Consecuencias

- Cambiar de idioma repite las consultas abiertas: los nombres de las categorías cambian a la vez
  que los textos, sin recargar.
- La búsqueda y los filtros de movimientos comparan con el nombre que se ve, en el idioma activo.
  Buscar por el nombre en otro idioma no encuentra nada.
- El nombre de una categoría en un aviso (por ejemplo «Guardada: Recibos») es el escrito en ese
  momento y no se traduce después.
- Las traducciones a un idioma que deje de tener la interfaz se conservan al editar la categoría,
  aunque no se vean.
- Añadir un idioma a la interfaz no exige cambiar el esquema: basta con su código. Para que la
  plantilla lo traiga, hay que añadirlo a `CATEGORY_TEMPLATE_TRANSLATIONS`.
- Las BD ya existentes no traen traducciones de la plantilla: se cargaron antes de la migración 009. Ver sus categorías en otro idioma exige escribir sus nombres.
