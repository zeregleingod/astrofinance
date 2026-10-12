# ADR-0011: Reglas de categoría y su aplicación a los movimientos existentes

- **Estado:** aceptado
- **Fecha:** 2026-10-12

## Contexto

Clasificar a mano cada movimiento importado no escala. El esquema ya tenía la tabla `rules`
(ADR-0005) y el plan preveía un motor (T1.6), su pantalla (T4.2) y la autoclasificación en lote
con vista previa (T4.3). Faltaba decidir qué texto leen las reglas, cómo se comparan, qué
movimientos pueden tocar y cómo se protege al usuario de una regla mal escrita.

## Decisión

- **Lugar.** Página «Configuración › Reglas de categoría»
  (`/configuracion/reglas-de-categoria`, `features/settings/category-rules-page`): alta arriba,
  tabla con edición en la fila y borrado, y el botón «Aplicar a movimientos existentes». Se
  llaman «de categoría» porque más adelante habrá otras reglas, las que cambien el concepto
  visible (el del banco no se toca nunca, ADR-0007).
- **Condiciones** (`domain/rules/rule.ts`): `contiene`, `exacto`, `empieza`, `termina` y `regex`.
  `exacto` es nuevo: la migración 004 reconstruye `rules` para admitirlo. Las cuatro primeras
  comparan sin distinguir mayúsculas, acentos ni espacios repetidos; `regex` usa las banderas
  `iu` sobre el texto tal cual.
- **El texto se guarda en mayúsculas**, como escriben los bancos los conceptos, salvo en una
  expresión regular, donde cambiar la caja cambiaría su significado (`\d` y `\D`).
- **Texto que se compara:** el concepto **del banco** (`original_description`), no el que el
  usuario haya editado (ADR-0007); en los movimientos manuales, el único que hay.
- **Orden:** gana la primera regla que coincide, por `priority`; una regla nueva va al final. No
  se admiten dos reglas con la misma condición.
- **Qué movimientos se tocan:** solo los que no tienen categoría o la recibieron de una regla
  (`category_source` distinto de `manual`). Lo clasificado a mano no se pisa nunca. Si ninguna
  regla reconoce un movimiento, se queda como está.
- **Aplicar es en dos pasos.** `previewRules` calcula los cambios sin escribir y la página los
  enseña en una tabla; `applyRules` los vuelve a calcular y los escribe en una transacción solo
  al confirmar. Si los datos cambian con la vista previa abierta, esta se descarta.
- **Expresiones regulares.** Se validan al guardar (200 caracteres como máximo) y se rechazan las
  repeticiones anidadas del tipo `(a+)+`, la causa más habitual de expresiones que no terminan.
  Se ejecutan en el worker de BD, nunca en el hilo principal, contra conceptos de 500 caracteres
  como máximo.

## Consecuencias

- Eliminar una regla no cambia los movimientos que clasificó: conservan su categoría
  (`rule_id` pasa a `NULL`). Cambiar la categoría de una regla tampoco, hasta volver a aplicarla.
- La detección de expresiones peligrosas es una heurística: no cubre todos los casos (por
  ejemplo `(a|aa)+`) y rechaza alguna expresión inofensiva. Una que se escape puede bloquear el
  worker hasta recargar la página.
- La pantalla solo edita condición, texto y categoría. El signo, el rango de importe, la cuenta
  y el estado activo/inactivo existen en el esquema y el motor los respeta, pero aún no se
  pueden cambiar; las reglas nuevas valen para cualquier signo, importe y cuenta.
- Pendiente: proponer la categoría en la revisión de una importación (T6.4), reordenar las
  reglas y activarlas o desactivarlas (T4.2), y «crear regla desde este movimiento» (T4.4).
