# ADR-0020: Tabla de movimientos compacta y campos en blanco

- **Estado:** aceptado
- **Fecha:** 2026-10-22

## Contexto

La tabla de Movimientos tenía nueve columnas. A 1440 px casi todas se recortaban («Categ…»,
«Cuen…», «O.») y la descripción, lo que más se lee, se cortaba a los 20 caracteres. La columna
«Fecha original» repetía la fecha en casi todas las filas, la categoría y la subcategoría iban en
columnas separadas aunque se leen juntas, y los dos iconos de acción de cada fila, de 24 px,
pesaban más que los datos. Los campos en los que se escribe tenían el fondo transparente y, sobre
la superficie lavanda, apenas se distinguían.

## Decisión

- **Siete columnas:** Fecha, Descripción, Etiquetas, Categoría, Cuenta, Importe y Observaciones.
  - **Categoría** enseña «Principal › Subcategoría», con la principal atenuada, y ordena por las
    dos a la vez. Desaparece la columna «Subcategoría»; el filtro por subcategoría sigue.
  - **La fecha original** deja de ser una columna: la celda de la fecha la lleva cuando difiere
    (icono, color, título «Fecha original: …» y texto para lectores de pantalla). Ya no se ordena
    por ella.
  - **Etiquetas:** cabe una; las demás, en un «+n» con todas en el título y para lectores de
    pantalla.
- **Filas de 34 px** (antes 41), separadores más suaves y cabecera pequeña y atenuada. La
  descripción va en peso medio; la cuenta y las observaciones, atenuadas.
- **Acciones siempre visibles:** dividir y editar se ven en todas las filas, en pequeño (iconos de
  18 px), al final. Se probó a enseñarlas solo al pasar el ratón y se descartó: el usuario quiere
  verlas siempre.
- **Los submovimientos** van sobre un fondo apenas tintado que los agrupa con su movimiento.
- **Campos en blanco en toda la app:** los `mat-form-field` con contorno y los campos propios de
  importación, categorías y reglas tienen fondo `surface-container-lowest` (blanco; en oscuro, el
  tono de las tarjetas). Los deshabilitados quedan transparentes.

## Consecuencias

- Las tarjetas de móvil siguen teniendo todos los datos, también la fecha original; solo se
  compactan un poco.
- Una columna nueva tiene que caber en el reparto de anchos (`transactions-page.scss`): las de
  ancho fijo y las de porcentaje suman el ancho de la tabla, y la de observaciones toma el resto.
