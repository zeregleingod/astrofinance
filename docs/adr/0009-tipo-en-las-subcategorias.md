# ADR-0009: El tipo es de las subcategorías; las categorías principales solo agrupan

- **Estado:** aceptado
- **Fecha:** 2026-10-11

## Contexto

En el esquema inicial (ADR-0005) toda categoría tenía un tipo (`ingreso`, `gasto` o `neutra`) y
las subcategorías lo heredaban de su categoría principal. Al usar la pantalla «Configuración ›
Categorías» se ve que eso no encaja con cómo se organiza el dinero: dentro de un mismo bloque
puede haber partidas de distinto tipo (una devolución que es ingreso dentro de un bloque de
gastos, un traspaso neutro…), y el tipo de la principal no aportaba nada que no dijeran ya sus
subcategorías.

## Decisión

- Una **categoría principal** solo agrupa: tiene nombre y color, y **no tiene tipo**
  (`kind IS NULL`).
- Una **subcategoría** tiene nombre y **tipo propio**, obligatorio, que se elige al crearla y
  se puede cambiar después.
- A un movimiento **solo se le asignan subcategorías**: las principales dejan de ofrecerse al
  categorizar (`categoryOptions`).

La columna `categories.kind` era `NOT NULL`, y SQLite no permite quitar esa restricción: la
migración 003 reconstruye la tabla (crear, copiar, borrar y renombrar). Para eso el ejecutor de
migraciones admite ahora `rebuildsTables`, que desactiva las claves ajenas mientras dura la
migración, ejecuta `PRAGMA foreign_key_check` antes de confirmar y las vuelve a dejar como
estaban.

## Consecuencias

- Los totales del mes (ingresos, gastos, ahorro) ya se calculaban sumando por el tipo de cada
  categoría con movimientos, así que pasan a depender solo del tipo de las subcategorías; el
  informe no cambia de forma.
- Una categoría principal recién creada no se puede asignar a ningún movimiento hasta que
  tenga al menos una subcategoría.
- La restricción nueva es `parent_id IS NULL OR kind IS NOT NULL`: toda subcategoría tiene
  tipo. No se prohíbe en el esquema que un movimiento apunte a una principal (podría venir de
  datos antiguos); en ese caso sigue contando en su bloque y en el balance, pero no en los
  totales de ingresos ni de gastos, y la pantalla de categorías lo cuenta en la fila de la
  principal.
- La plantilla de categorías y la demo dan a cada subcategoría el tipo que antes tenía su
  bloque.
- El tipo `neutra` pasa a llamarse **`ahorro`** («Ahorro» en pantalla), que es para lo que
  sirve; la misma migración 003 renombra el valor guardado. Sus movimientos no cuentan como
  ingreso ni como gasto. En el resumen el ahorro se enseña **en positivo** cuando se aparta
  dinero, tanto en el indicador «Ahorro» como en las líneas y el total de su bloque, aunque
  el movimiento sea una salida de la cuenta (negativa); una retirada resta. El balance no
  cambia: sigue descontando lo ahorrado.
- Queda disponible `rebuildsTables` para futuras migraciones que necesiten reconstruir una
  tabla.
