# ADR-0014: El orden de las categorías se elige en «Categorías» y lo siguen los resúmenes

- **Estado:** aceptado
- **Fecha:** 2026-10-18

## Contexto

El Resumen mensual y el Resumen anual enseñan las categorías en el orden de `categories.sort_order`
(ADR-0005), pero no había forma de cambiarlo: las nuevas iban al final y la plantilla mandaba. Cada
persona quiere sus categorías en el orden en que lee la hoja (primero los ingresos, luego la
vivienda…). Solo hay dos niveles y una subcategoría pertenece a su principal: ordenar no puede
servir para cambiarla de principal.

## Decisión

- En «Configuración › Categorías» cada fila tiene un asa para arrastrarla (CDK drag-drop) y dos
  botones, «Subir» y «Bajar». Las principales se ordenan entre sí, cada una con su bloque. Las
  subcategorías de cada principal forman una lista aparte, sin conectar con las demás, así que no
  pueden salir de ella.
- Los botones son la alternativa al arrastre para teclado, lectores de pantalla y quien no puede
  arrastrar (WCAG 2.5.7). El asa queda oculta a los lectores de pantalla. Cada cambio se anuncia
  con la nueva posición («Movida: Ingresos, posición 2 de 6») y el foco se queda en la flecha.
- El worker recibe el orden completo de un nivel (`reorderCategories { parentId, ids }`) y
  reescribe `sort_order` de 1 en adelante en una transacción. Si `ids` no son exactamente las
  hermanas de ese nivel (falta, sobra o se repite alguna, o es de otra principal), lo rechaza
  con `orden-desfasado` sin tocar nada.
- La página cambia el orden en el acto y lo guarda después. Si no se puede guardar, enseña el
  error y recarga la lista desde la BD.

## Consecuencias

- Los resúmenes y los desplegables de categoría siguen el orden sin cambios en sus consultas: ya
  ordenaban por `sort_order`.
- Mandar el orden completo en vez de «mueve X a la posición N» hace que la operación sea
  idempotente y fácil de validar. Con dos personas editando a la vez gana la última, que es
  aceptable en una app de un solo usuario.
- Sigue pendiente mover una subcategoría a otra principal: será una acción aparte, no un
  arrastre.
