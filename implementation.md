# Plan de implementación — Gestor financiero personal (100 % offline)

Stack: Angular 22 (standalone, zoneless, Signals) · TypeScript estricto · Angular Material · SQLite WASM oficial en Web Worker · OPFS · PWA · SheetJS · Vitest · Playwright.

---

## 0. Cómo usar este plan

Cada tarea sigue el ciclo **rojo → verde → refactor** y es lo bastante pequeña para un commit (o pocos).

- **Test primero**: qué prueba se escribe antes de la implementación (debe fallar).
- **Hecho cuando**: criterio verificable de finalización.
- Una tarea no se da por terminada si rompe lint, tipos o tests anteriores.

### Definition of Done global (aplica a todas las tareas)

- [ ] `tsc` en modo estricto sin errores; ESLint sin avisos.
- [ ] Tests unitarios verdes; cobertura de `domain/` ≥ 90 %.
- [ ] Ninguna petición de red en tiempo de ejecución (verificado en e2e, ver T9.4).
- [ ] Todo SQL parametrizado (nunca concatenar datos del usuario).
- [ ] Sin `any` implícito ni `innerHTML` con datos del usuario.
- [ ] Decisiones relevantes anotadas como ADR en `docs/adr/`.

### Supuestos (a revisar)

| Tema | Supuesto adoptado |
|---|---|
| Cifrado de datos | Decisión del usuario: v1 **sin cifrado en reposo** (todo local). La Fase 10 queda como opcional; reconsiderar antes de añadir Google Drive o si el `.db` exportado se va a compartir. |
| Moneda / cuentas | EUR única; el modelo ya admite varias cuentas (una activa en v1). |
| Formato Sabadell | Confirmado con una muestra real (`.xls` de mayo de 2025; ver T6.0–T6.3). Pendiente: muestra en CSV si se va a usar ese formato. |
| Versiones | Verificar compatibilidad real de Angular 22, Material y SW en T0.1. |

---

## Fase 0 — Fundaciones del proyecto

- [ ] **T0.1 Crear workspace Angular**: standalone, zoneless, SCSS, strict, Node LTS fijado (`.nvmrc`), gestor de paquetes fijado con lockfile.
  - Test primero: test de humo del componente raíz.
  - Hecho cuando: `ng build` y `ng test` pasan en limpio.
- [ ] **T0.2 Lint, formato y fronteras de capas**: ESLint + Prettier + reglas de límites (`domain` no importa Angular ni `data`; `workers` solo importan `domain`; `features` no importan `workers`).
  - Test primero: fichero de prueba que viola la regla y debe fallar el lint.
  - Hecho cuando: el lint rompe ante imports prohibidos.
- [ ] **T0.3 Vitest**: configuración, umbrales de cobertura por carpeta.
  - Hecho cuando: `npm test` ejecuta y reporta cobertura.
- [ ] **T0.4 Playwright**: proyectos Chromium, Firefox, WebKit y un perfil móvil; servidor de e2e contra el build de producción.
  - Test primero: e2e “la app carga y muestra el título”.
- [ ] **T0.5 Pipeline local/CI**: lint → unit → build → e2e → `npm audit` (fallo en vulnerabilidades altas).
- [ ] **T0.6 SheetJS desde la fuente oficial**: instalar desde `cdn.sheetjs.com` (el paquete `xlsx` del registro npm está desactualizado y arrastra vulnerabilidades conocidas), versión fijada, tarball vendorizado en el repo.
  - Hecho cuando: build reproducible sin acceso a red al CDN.
- [ ] **T0.7 Política de seguridad base**: CSP estricta (`default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, `connect-src 'none'`, `object-src 'none'`), cabeceras documentadas para el hosting estático.
  - Test primero: e2e que lee la CSP efectiva y falla si aparece `unsafe-inline`/`unsafe-eval`.

---

## Fase 1 — Dominio puro (TypeScript sin Angular)

> Todo con TDD estricto. Sin dependencias de navegador, SQLite ni Angular.

- [ ] **T1.1 `Money`**: importes en céntimos (enteros), suma/resta/negación, parseo de `"1.234,56"` y `"-12,3"`, formateo es-ES.
  - Test primero: casos de redondeo, negativos, separadores, entrada inválida, desbordamiento.
  - Hecho cuando: ninguna operación usa `number` decimal.
- [ ] **T1.2 Modelos y invariantes**: `Transaction`, `Category`, `Account`, `Rule`, `RecurringSeries` con constructores/validadores. `Category` tiene tipo `ingreso | gasto | neutra`: las neutras (p. ej. transferencias entre cuentas propias) no cuentan como ingreso ni gasto. Un importe positivo en una categoría de gasto (devolución/anulación) se resta del gasto.
- [ ] **T1.3 Normalizador de descripciones**: mayúsculas, quitar tildes, colapsar espacios; eliminar la tarjeta enmascarada (`5402XXXXXXXX6019`), identificadores variables de operación (p. ej. `P36E5ECBA5`), teléfonos, asteriscos y fechas incrustadas; separar el prefijo de operación (`COMPRA TARJ.`, `ANUL COMPRA TARJ.`, `ADEUDO RECIBO`, `ABONO TRANSFERENCIA`…) del comercio.
  - Test primero: tabla de entradas reales anonimizadas → salida esperada.
- [ ] **T1.4 Hash de deduplicación**: determinista sobre (cuenta, fecha operativa, importe, concepto **original**, saldo posterior al movimiento, contador de repetición dentro del lote). Se usa el concepto original (con sus identificadores) y no el normalizado, para no fusionar movimientos distintos.
  - Test primero: dos movimientos idénticos legítimos el mismo día no deben colapsar; la reimportación del mismo fichero sí.
- [ ] **T1.5 Árbol de categorías**: padre/hijo, detección de ciclos, borrado con reasignación, profundidad máxima configurable (2 en v1, modelo genérico).
- [ ] **T1.6 Motor de reglas**: operadores `contiene`, `empieza`, `termina`, `regex` (validada y con límite de longitud), rango de importe, signo (ingreso/gasto); prioridad; primera coincidencia gana; modo **dry-run** que devuelve un diff (`movimiento → categoría propuesta`) sin aplicar.
  - Test primero: conflictos de prioridad, regla deshabilitada, no pisar clasificaciones manuales, regex inválida/patológica rechazada.
- [ ] **T1.7 Agregaciones de referencia**: totales por mes, categoría y subcategoría en memoria (oráculo para contrastar el SQL de T2.6).
- [ ] **T1.8 Detector de recurrencias y suscripciones**: agrupa por comercio normalizado, intervalos ≈ semanal/mensual/trimestral/anual, tolerancia de importe, puntuación de confianza. Ignora los pares compra + anulación que suman 0 (la muestra real incluye cargos de 1 € anulados al momento).
  - Test primero: suscripción mensual con subida de precio, cobro anual, comercio frecuente no recurrente (supermercado) → no detectado, huecos por mes sin cobro.
- [ ] **T1.9 Proyección**: próximos vencimientos esperados a partir de una serie confirmada.

---

## Fase 2 — Capa de datos (SQLite WASM + OPFS en Web Worker)

- [ ] **T2.1 Spike de viabilidad** (documentar en ADR): SQLite WASM oficial en Worker con BD en memoria + lectura/escritura de bytes en OPFS con `createSyncAccessHandle`; comprobar que **no** se necesitan cabeceras COOP/COEP.
  - Test primero: Vitest en modo navegador (Playwright provider): crear tabla, serializar, escribir en OPFS, recargar y deserializar.
  - Hecho cuando: funciona en Chromium, Firefox y WebKit.
- [ ] **T2.2 RPC tipado main ↔ worker**: IDs de petición, errores serializables, timeouts, cancelación; sin dependencias externas.
  - Test primero: con `MessageChannel` simulado (éxito, error, timeout, respuesta desordenada).
- [ ] **T2.3 Ejecutor de migraciones** con `PRAGMA user_version`.
  - Test primero: BD vacía → última versión; idempotente; rechaza BD con versión **mayor** que la soportada; migración atómica (rollback si falla).
- [ ] **T2.4 Esquema inicial (migración 001)**: `meta(db_uuid, revision, created_at)`, `accounts` (alias + últimos 4 dígitos del IBAN; nunca IBAN completo ni titular), `categories(parent_id)`, `transactions` (importe en céntimos `INTEGER`, fecha ISO `TEXT`, `category_source` manual/regla/ninguna, `dedupe_hash UNIQUE`, `import_batch_id`, `recurring_id`), `rules`, `import_batches`, `recurring_series`, `settings`; FKs activadas, `CHECK`s e índices por fecha, categoría y hash.
  - Test primero: violaciones de constraints deben fallar (importe no entero, FK rota, hash duplicado).
- [ ] **T2.5 Repositorios** (puertos en `domain/ports`, implementación en el worker): categorías, cuentas, movimientos, reglas, recurrentes, lotes.
  - Test primero: CRUD contra SQLite en memoria en Node; inyección SQL en campos de texto no tiene efecto.
- [ ] **T2.6 Consultas de agregación en SQL**: por mes, categoría, subcategoría y totales.
  - Test primero: mismo dataset que T1.7; resultados idénticos al oráculo.
- [ ] **T2.7 Copia de trabajo en memoria + contador de cambios**: cargar el último guardado válido desde OPFS; `dirty` derivado de cambios desde el último guardado.
- [ ] **T2.8 Guardado seguro**: doble ranura (A/B) con manifiesto (generación + checksum); escribir en la ranura inactiva, verificar y luego actualizar el manifiesto; `revision++` antes de serializar.
  - Test primero: fallo simulado a mitad de escritura → la carga siguiente recupera la generación anterior intacta; checksum corrupto → se descarta la ranura.
- [ ] **T2.9 Descartar cambios**: recarga desde el último guardado y limpia `dirty`.
- [ ] **T2.10 Instancia única por origen**: `navigator.locks` (Web Locks) para impedir dos pestañas con copias de trabajo divergentes.
  - Test primero (e2e): segunda pestaña muestra aviso y queda en solo lectura/bloqueada.
- [ ] **T2.11 Importar `.db` externo**: validar cabecera `SQLite format 3\0`, tamaño máximo, abrir en una BD **aislada**, `PRAGMA integrity_check`, `foreign_key_check`, tablas esperadas, `user_version` (migrar si es menor, rechazar si es mayor); reemplazar la copia de trabajo solo si todo pasa; comparar `db_uuid`/`revision` y avisar si el fichero es más antiguo o divergente.
  - Test primero: fichero no SQLite, truncado, con esquema ajeno, versión futura, versión antigua migrable, misma BD con `revision` menor.
- [ ] **T2.12 Exportar `.db`**: descarga con nombre fechado; File System Access API con detección de características y *fallback* a descarga clásica (móvil/Safari/Firefox).
- [ ] **T2.13 Persistencia de almacenamiento**: `navigator.storage.persist()` y estimación de cuota; estado expuesto a la UI.

---

## Fase 3 — Shell de la aplicación y estado

- [ ] **T3.1 Rutas lazy y layout Material** responsive (navegación lateral en escritorio, inferior en móvil), tema claro/oscuro, textos en español centralizados.
- [ ] **T3.2 `DbService` (fachada)**: signals de solo lectura `status`, `dirty`, `lastSavedAt`, `dataVersion`, `error`.
  - Test primero: transiciones de estado con un worker falso.
- [ ] **T3.3 Barra de persistencia global**: botones **Guardar** y **Descartar**, indicador de cambios sin guardar, `beforeunload` y *guard* de navegación cuando `dirty`.
  - Test primero: componente + e2e (editar → recargar sin guardar → aviso).
- [ ] **T3.4 Primer arranque**: crear BD nueva (con plantilla opcional de categorías) o cargar un `.db` existente.
- [ ] **T3.5 Errores y notificaciones**: manejador global, `MatSnackBar`, sin volcar datos financieros a la consola.
- [ ] **T3.6 Patrón de lectura**: consultas con `resource()`/equivalente dependientes de `dataVersion`; escrituras mediante *use-cases* que incrementan `dataVersion` y marcan `dirty`.

---

## Fase 4 — Categorías y reglas

- [ ] **T4.1 CRUD de categorías y subcategorías** (árbol, color, tipo ingreso/gasto); borrar exige reasignar movimientos.
- [ ] **T4.2 CRUD de reglas**: ordenar por prioridad (arrastrar), activar/desactivar, **probar en vivo** con recuento y ejemplos de coincidencias.
- [ ] **T4.3 Acción “Autoclasificar”**: dry-run → diálogo con diff agrupado por categoría → **confirmar** → aplicar en una única transacción; por defecto no sobrescribe clasificaciones manuales.
  - Test primero (e2e): crear regla → autoclasificar → cancelar (sin cambios) → repetir y confirmar.
- [ ] **T4.4 Atajo “crear regla desde este movimiento”**.

---

## Fase 5 — Movimientos

- [ ] **T5.1 Listado** con búsqueda, filtros (fecha, categoría, importe, sin categorizar), ordenación y *virtual scroll*.
- [ ] **T5.2 Alta/edición/borrado manual** con validación (`Money`, fecha).
- [ ] **T5.3 Edición masiva** (asignar categoría a una selección).
- [ ] **T5.4 E2E del flujo manual**: crear → categorizar → guardar → recargar → los datos persisten.

---

## Fase 6 — Importación bancaria (Banc Sabadell)

- [ ] **T6.0 *Fixtures* reales**: la muestra `.xls` de mayo de 2025 (16 movimientos) pasa a `e2e/fixtures/`, **tras anonimizar IBAN, titular y tarjeta** (el fichero original los contiene en claro). Documentar columnas, formatos y quirks. Pendiente: muestra en CSV (si se usa) y un mes más largo con otros tipos de operación.
- [ ] **T6.1 Lectura segura de ficheros** en worker dedicado: soporta `.xls` (BIFF antiguo, formato real del banco), `.xlsx` y CSV; límite de tamaño y filas, tipo detectado por contenido (no por extensión), sin evaluar fórmulas, errores controlados.
  - Test primero: fichero vacío, enorme, binario disfrazado, con fórmulas, con celdas combinadas (el preámbulo del `.xls` real las tiene), codificación errónea.
- [ ] **T6.2 `BankProfile` + perfil Sabadell** (puro, en `domain`): mapea filas crudas a movimientos.
  - Formato observado: un preámbulo de ~8 filas (título, fecha de consulta, cuenta, divisa, titular, periodo) y una tabla con cabecera `F. Operativa | Concepto | F. Valor | Importe | Saldo | Referencia 1 | Referencia 2`; orden descendente por fecha; importes con signo (gastos negativos); `Saldo` = saldo tras el movimiento.
  - Reglas del perfil: localizar la fila de cabecera **buscando los nombres de columna** (no por posición fija); aceptar fechas como texto `dd/mm/aaaa` o como serial de Excel, e importes numéricos o en texto es-ES; leer del preámbulo solo la divisa (debe ser EUR) y el periodo (validar que las filas caen dentro); del IBAN conservar solo los últimos 4 dígitos y **descartar titular e IBAN completo**.
  - Test primero: contra el *fixture* real; cabecera movida de fila; columnas ausentes; filas con datos faltantes producen errores por fila y no abortan el lote; test explícito de que ni el titular ni el IBAN completo llegan al resultado.
- [ ] **T6.3 Deduplicación, integridad y resumen del lote**: nuevos / duplicados (en BD y dentro del lote) / con error.
  - **Comprobación de saldos**: ordenados cronológicamente, cada `Saldo` debe ser el anterior + `Importe` (la muestra real cuadra al céntimo). Si no cuadra, avisar con la fila afectada (señal de fila mal leída o movimiento ausente).
  - **Continuidad entre importaciones**: el saldo inicial implícito del fichero debe coincidir con el último saldo guardado de la cuenta; si no, avisar de posible hueco entre exportaciones.
  - Test primero: reimportar el mismo fichero (0 nuevos), ficheros con periodos solapados, fila alterada que rompe la cadena de saldos, hueco entre dos meses.
- [ ] **T6.4 Pantalla de revisión (staging)**: tabla previa con categoría propuesta por reglas, edición manual y exclusión de filas; **no se escribe nada hasta confirmar**.
- [ ] **T6.5 Confirmar lote**: inserción en una transacción única vinculada a `import_batch`; opción de **revertir el lote completo**.
- [ ] **T6.6 E2E**: importar fixture → revisar → confirmar → guardar → recargar → datos presentes; reimportar el mismo fichero → 0 nuevos.
- [ ] **T6.7 Exportación a Excel/CSV** (SheetJS) con **neutralización de inyección de fórmulas** (celdas que empiezan por `=`, `+`, `-`, `@`).

---

## Fase 7 — Recurrentes y suscripciones

- [ ] **T7.1 Persistencia de series recurrentes** y vínculo movimiento ↔ serie.
- [ ] **T7.2 Pantalla de sugerencias**: detección con puntuación de confianza → confirmar / descartar (los descartes se recuerdan).
- [ ] **T7.3 Vista de suscripciones**: coste mensual y anual equivalente, próximo cobro, aviso de subida de importe.
- [ ] **T7.4 Movimientos previstos** integrados en el dashboard, claramente diferenciados de los reales.

---

## Fase 8 — Dashboard

> Librería de gráficos ligera y 100 % local (propuesta: Chart.js con un envoltorio propio). Registrar como ADR.

- [ ] **T8.1 Selector de mes/rango y KPIs**: ingresos, gastos, balance, tasa de ahorro.
- [ ] **T8.2 Desglose por categoría y subcategoría** (*drill-down*) con gráfico y tabla accesible.
- [ ] **T8.3 Tendencia de 12 meses** y comparación con el mes anterior.
- [ ] **T8.4 Vista mensual individual** (`/mes/:aaaa-mm`) con movimientos y navegación mes a mes.
- [ ] **T8.5 Rendimiento**: *benchmark* con ≥ 50 000 movimientos; las consultas del dashboard no bloquean la UI (todo en el worker).
- [ ] **T8.6 Accesibilidad**: resumen textual de gráficos, no depender solo del color, contraste AA, navegación por teclado.

---

## Fase 9 — PWA, offline y robustez

- [ ] **T9.1 Service Worker y manifest**: precarga completa (incluido el `.wasm`), iconos *maskable*, instalable.
- [ ] **T9.2 Actualización controlada**: aviso de nueva versión; solo se aplica si no hay cambios sin guardar.
- [ ] **T9.3 E2E offline**: instalar, cortar red, recargar y operar (importar, categorizar, guardar).
- [ ] **T9.4 Garantía “cero red”**: e2e que aborta cualquier petición externa y falla si la app intenta alguna.
- [ ] **T9.5 Recordatorio de copia de seguridad**: fecha de última exportación; aviso si el almacenamiento no es persistente.
- [ ] **T9.6 Matriz de navegadores**: Chromium, Firefox, WebKit en Playwright + verificación manual en un Android y un iOS reales (OPFS y Web Locks).

---

## Fase 10 — Cifrado opcional (fuera de la v1; reconsiderar antes de Google Drive)

- [ ] **T10.1 Formato de fichero cifrado**: cabecera con *magic* y versión, sal, iteraciones, *nonce*, AES-GCM; PBKDF2-SHA256 con iteraciones acordes a OWASP, vía Web Crypto.
  - Test primero: vectores conocidos, detección de manipulación, contraseña incorrecta.
- [ ] **T10.2 Exportar/importar cifrado** y bloqueo por inactividad; la clave vive solo en memoria.
- [ ] **T10.3 ADR**: cifrar o no la copia local en OPFS (coste: sin contraseña no se abre la app).

---

## Fase 11 — Extensiones previstas (no implementar aún)

- Adaptador de **Google Drive** detrás del puerto `StoragePort` (rompe el “100 % offline”: requerirá relajar `connect-src` solo en ese módulo y un ADR específico).
- Multi-cuenta real, presupuestos, multi-moneda, nuevos `BankProfile`.

---

## Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Pérdida de cambios no guardados si la pestaña se cierra o falla | Indicador `dirty`, `beforeunload`, guard de navegación; valorar borrador opcional en el futuro |
| El navegador borra el almacenamiento OPFS | `storage.persist()`, recordatorio de exportación, doble ranura |
| Dos pestañas sobrescriben datos | Web Locks (T2.10) |
| Divergencia entre dispositivos al mover el `.db` | `db_uuid` + `revision` y aviso al importar (T2.11) |
| Formato del banco cambia | Perfiles aislados y *fixtures* versionados |
| Dependencias vulnerables (SheetJS, etc.) | Fuente oficial fijada, auditoría en CI, ficheros tratados como no confiables |
