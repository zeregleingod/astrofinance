# ADR-0024: Reglas de concepto

- **Estado:** aceptado
- **Fecha:** 2026-10-28

## Contexto

Los conceptos del banco traen ruido: números de cuenta o de tarjeta, códigos de pedido
(`AMAZON-192903812-022`)… Cambiarlos a mano movimiento a movimiento no escala. ADR-0011 ya
anunciaba unas reglas que cambiasen el concepto visible, distintas de las de categoría. Faltaba
decidir cómo se escriben, sobre qué texto trabajan y cómo conviven con lo que edita el usuario.

## Decisión

- **Lugar.** Página «Configuración › Reglas de concepto» (`/configuracion/reglas-de-concepto`,
  `features/settings/concept-rules-page`), igual que la de categoría: alta arriba, tabla con
  edición en la fila y borrado, y «Aplicar a movimientos existentes» con vista previa. Comparte
  la hoja de estilos de `category-rules-page`.
- **Una regla** (`domain/rules/concept-rule.ts`, tabla `concept_rules`, migración 008) tiene
  condición (`contiene`, `exacto`, `regex`), texto, alcance y sustitución. El alcance dice qué
  se sustituye: **solo lo que coincide** (borrar un número de cuenta) o **todo el concepto**
  (`AMAZON-…` → «Amazon compra»). «Es exactamente» siempre sustituye el concepto entero.
- **Comparación.** Como en las reglas de categoría: el texto se guarda en mayúsculas y se
  compara sin distinguir mayúsculas, acentos ni espacios repetidos; la expresión regular usa
  `iu` sobre el texto tal cual y su sustitución admite `$1`, `$2`…; en las demás la sustitución
  es literal. La sustitución se guarda tal cual se escribe.
- **Encadenadas.** Las reglas se aplican de arriba abajo y cada una trabaja sobre lo que deja la
  anterior: una borra la tarjeta y la siguiente puede reconocer lo que queda. El resultado se
  limpia de espacios repetidos; una regla que lo dejaría vacío no se aplica.
- **Texto de partida:** siempre el concepto **del banco** (`original_description`, ADR-0007),
  que nunca cambia. El concepto visible es el resultado de las reglas sobre él.
- **Origen del concepto:** `transactions.description_source` (`banco`, `regla`, `manual`). Lo que
  escribe el usuario (en la revisión de la importación o al editar el movimiento) es `manual` y
  las reglas no lo tocan; volver al concepto del banco lo deja otra vez como `banco`. La
  migración marca como `manual` los movimientos cuyo concepto ya no era el del banco. Los
  movimientos sin concepto del banco (creados a mano, la demo) no se tocan.
- **Al importar,** la revisión propone ya el concepto de las reglas (`rewriteDescriptions`) y se
  guarda con su origen.
- **Aplicar es en dos pasos,** como en ADR-0011: la vista previa calcula el concepto que dejan las
  reglas en cada movimiento que pueden tocar y enseña los que cambian; al confirmar se escriben
  en una transacción. Si ninguna regla cambia ya un concepto que vino de una regla, vuelve a ser
  el del banco.
- **Validación:** la de ADR-0011 para el texto (longitud, expresión válida, repeticiones
  anidadas, condición repetida) más dos: una expresión que coincide con un texto vacío (`X*`) y
  una sustitución vacía cuando se cambia el concepto entero.

## Consecuencias

- Crear, cambiar o eliminar una regla no toca los movimientos hasta aplicarlas. La columna
  «Movimientos» cuenta los conceptos que cambia cada regla ahora, no los que cambió.
- Las reglas de categoría y las sugerencias siguen leyendo el concepto del banco: renombrar un
  concepto no cambia su clasificación.
- En la demo no hay conceptos del banco, así que las reglas de concepto no cambian nada en ella.
- Pendiente, como en las de categoría: reordenar las reglas, activarlas o desactivarlas y
  probarlas en vivo.
