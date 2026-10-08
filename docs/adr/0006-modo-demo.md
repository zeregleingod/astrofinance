# ADR-0006: Modo demo con datos ficticios en memoria

- **Estado:** aceptado
- **Fecha:** 2026-10-08

## Contexto

Se quiere ver la aplicación con datos realistas antes de tener importación, edición y guardado,
y poder enseñarla sin exponer datos reales. Los datos de ejemplo no deben mezclarse nunca con los
del usuario.

## Decisión

- **Ruta `/demo`.** `demoGuard` abre una BD **nueva en memoria** en el worker de BD y redirige al
  Resumen. Mientras está abierta, una franja fija (`DemoBanner`, `role="status"`) avisa de que los
  datos son ficticios y no se guardan, con el botón «Salir de la demo». Salir o recargar la
  página descarta todo; la demo nunca toca OPFS.
- **Datos** en `workers/db/seeds/demo-data.ts`: anónimos (persona «Alex», bancos y comercios
  «Demo»), tres meses (julio a septiembre de 2026), todos los bloques de la plantilla y los casos
  del ADR-0005. Las categorías extra (Agua, Internet y móvil, Mascotas, Transporte) solo se crean
  en la BD de demo. Un test falla si aparece algún nombre real del Excel.
- **Vertical mínima** para poder verla, adelantando partes del plan:
  - T2.2: RPC tipado con ids, tiempo de espera y cancelación por `AbortSignal`.
  - T2.3: ejecutor de migraciones.
  - Parte de T3.2: `DbService` con las signals `status`, `mode`, `dataVersion` y `ready`.
  - Dos páginas de solo lectura: Resumen (por bloques, como la hoja mensual) y Movimientos.
    El mes se elige con `?mes=AAAA-MM`.
- `sqlite3.wasm` se copia como asset en `angular.json` junto al bundle del worker, que lo resuelve
  relativo a `import.meta.url`. No necesita cabeceras COOP/COEP ni peticiones externas.

## Consecuencias

- El e2e (`e2e/demo.spec.ts`) comprueba en Chromium, Firefox, WebKit y móvil que SQLite WASM
  arranca en el worker, sin errores de consola ni peticiones fuera del origen.
- La demo está en el build publicado: cualquiera puede verla en `/demo`.
- Los informes excluyen la pata de entrada de los traspasos para no contar dos veces el ahorro.
- Las consultas de informes viven en `workers/db/queries/reports.ts`; T2.6 las ampliará y las
  contrastará con el oráculo de T1.7.
