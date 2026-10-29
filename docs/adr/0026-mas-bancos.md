# ADR-0026: Más bancos en la importación

- **Estado:** aceptado
- **Fecha:** 2026-10-29

## Contexto

Hasta ahora solo se importaban extractos del Banc Sabadell (ADR-0007). Se piden BBVA, Bankinter,
CaixaBank, ING, N26, Revolut y Banco Santander. No hay extractos reales de ninguno en el proyecto:
los formatos salen de cómo exporta cada banco hoy, y pueden variar con el tiempo o el idioma.

## Decisión

- **Un perfil por banco**, como prevé ADR-0007, sobre unas piezas comunes en
  `domain/imports/profiles/table.ts`: cada perfil declara sus columnas con **varios nombres
  posibles** (`Importe`, `Importe EUR`, `Importe (€)`…) y una función que convierte una fila; la
  búsqueda de la cabecera, la validación de fecha, concepto e importe y los límites de longitud
  son los mismos para todos. El perfil del Sabadell pasa a usarlas sin cambiar su resultado.
- **Firmas que no se solapan.** Las columnas obligatorias de cada perfil lo identifican:
  `F. Operativa` (Sabadell), `Movimiento` + `Disponible` (BBVA), `Fecha contable` (Bankinter),
  `Más datos` (CaixaBank), `Subcategoría` (ING), `Fecha operación` (Santander), `Amount (EUR)`
  (N26) y `Started Date`/`State` (Revolut). Un test comprueba que cada hoja de ejemplo la reconoce **un
  solo** perfil. Ante la duda se prefiere no reconocer un fichero a atribuirlo al banco
  equivocado: la entidad identifica la cuenta y forma parte de la huella de duplicados.
- **Preámbulo genérico**: de la fila que nombra la cuenta (`Cuenta`, `IBAN`, `Account`) se
  conservan solo los 4 últimos dígitos, también si el número viene enmascarado; si se declara
  una divisa distinta del euro, el extracto se rechaza. Las columnas de divisa por movimiento
  (BBVA, Santander, Revolut) se comprueban fila a fila.
- **CSV en inglés** (N26, Revolut): fechas `aaaa-mm-dd` (con hora, que se descarta) e importes con
  punto decimal. `parseCents` admite el separador decimal como parámetro, en vez de adivinarlo:
  `1.500` es 1500 € en es-ES y 1,50 € en inglés.
- **Particularidades**:
  - BBVA: el concepto es `Concepto` (o `Movimiento` si está vacío); `Observaciones` va a la
    referencia.
  - CaixaBank: el concepto es `Movimiento` + `Más datos`; importes del tipo `-12,34EUR`.
  - ING: solo hay una fecha (`F. Valor`), que se usa como fecha de operación. Su categoría no se
    usa.
  - N26 y Revolut no traen la cuenta propia (`ibanLast4 = null`): habrá una sola cuenta por
    entidad. N26 no trae saldos. El IBAN de la contraparte de N26 no se lee.
  - Revolut: el importe es `Amount − Fee` (el saldo ya descuenta la comisión) y se omiten las
    operaciones pendientes, rechazadas o revertidas. Se reconoce también la exportación en
    español.

## Consecuencias

- La pantalla de importación lista los ocho bancos sin cambios: lee el registro.
- **Formatos sin verificar con ficheros reales.** Si un banco cambia sus cabeceras, el fichero
  dará «formato desconocido» (no se importará mal); se arregla añadiendo el nombre nuevo a la
  columna del perfil. Conviene probar cada perfil con un extracto real y anonimizar uno como
  _fixture_ (T6.0).
- Revolut: si la exportación mezcla productos (cuenta y huchas), los saldos no cuadrarán y la
  revisión lo avisará; no se filtra por producto.
