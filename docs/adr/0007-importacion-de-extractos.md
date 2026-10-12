# ADR-0007: Importación de extractos bancarios

- **Estado:** aceptado
- **Fecha:** 2026-10-11

## Contexto

El usuario descarga cada mes el extracto de su banco (hoy solo Banc Sabadell, `.xls`) y quiere
cargarlo, revisarlo y corregirlo antes de que nada quede guardado. Vendrán más bancos, cada uno
con su formato. El fichero es entrada no confiable y contiene el titular y el IBAN completo.

## Decisión

- **Flujo en tres pasos** (`/importar`): elegir fichero → revisión editable → guardar. La
  revisión vive solo en memoria de la página; la BD no se toca hasta confirmar, y entonces el
  lote entra en una única transacción (`commitImport`): todo o nada.
- **Un perfil por banco** (`domain/imports`). `BankProfile` tiene `matches(hoja)` y
  `parse(hoja)`; `BANK_PROFILES` es el registro y `parseStatement` usa el primer perfil que
  reconoce la hoja. Añadir una entidad es escribir `profiles/<banco>.ts` (TypeScript puro, con
  sus tests) y añadirlo al registro: ni el worker, ni la BD, ni la pantalla cambian. El `id`
  del perfil se guarda en `import_batches.bank_profile`.
- **Lectura en un worker propio** (`workers/import.worker.ts`, SheetJS): se crea para cada
  fichero y se destruye al terminar. Límite de 5 MB y 20 000 filas, tipo decidido por el
  contenido (no por la extensión), sin leer fórmulas. Al dominio solo le llegan textos y números
  (`RawSheet`); del preámbulo salen únicamente los cuatro últimos dígitos del IBAN.
- **Concepto original y concepto visible** (migración 002). `transactions.description` es el
  concepto que se muestra y que el usuario puede cambiar; `original_description` guarda el del
  banco, es `NULL` en los movimientos manuales y un trigger impide modificarlo. Sirve para
  restaurar el concepto y para que las futuras reglas de autocategorización trabajen sobre un
  texto estable.
- **Huella de duplicados** (T1.4): SHA-256 de (perfil, últimos 4 del IBAN, fecha operativa,
  importe, concepto original, saldo posterior, contador de repetición en el fichero). Se calcula
  con los datos **del banco, antes de cualquier edición**, así que cambiar el concepto o el
  importe en la revisión no hace que el movimiento vuelva a entrar al reimportar. Se usa la
  cuenta del fichero y no el `id` de la BD para que la huella no dependa de la base de datos.
  SHA-256 está implementado en `domain/crypto` porque el dominio no puede usar Web Crypto.
- **Cuenta**: se busca por entidad + últimos 4 dígitos del IBAN; si no existe se da de alta
  como cuenta corriente con el saldo anterior al primer movimiento del extracto.
- **Comprobación de saldos**: cada saldo debe ser el anterior más el importe; las filas que no
  cuadran se avisan en la revisión, sin bloquear.
- **BD del usuario en memoria (`DbService.openLocal`, modo `local`)**: como todavía no existe
  el guardado en OPFS (T2.7–T2.8), importar abre una BD vacía con la plantilla de categorías que
  vive solo en la pestaña. La pantalla lo avisa. En el modo demo no se puede importar (ADR-0006:
  los datos de ejemplo no se mezclan con los del usuario), y el enlace «Ver la demo» se oculta
  mientras hay una BD local abierta para no descartarla por accidente.

## Consecuencias

- El extracto real del Sabadell (65 movimientos, enero de 2026) se importa sin avisos; no está
  en el repositorio. Los tests usan una hoja ficticia (`src/testing/sabadell-sheet.ts`) y el e2e
  un `.xls` ficticio generado por `tools/make-sabadell-fixture.mjs`.
- **Los datos importados se pierden al recargar** hasta que se implemente T2.7–T2.8. Es la
  siguiente pieza necesaria para usar la aplicación con datos reales.
- Pendiente de T6.3/T6.5: aviso de hueco entre importaciones (continuidad de saldos entre
  ficheros) y revertir un lote completo. Pendiente de la Fase 4: categoría propuesta por reglas
  en la revisión (hoy la categoría se elige a mano).
- Editar un importe rompe la cadena de saldos de la cuenta a propósito: `balance_after_cents`
  conserva el saldo del banco.
- El bundle del worker de importación (SheetJS, ~380 kB) solo se descarga al importar.
