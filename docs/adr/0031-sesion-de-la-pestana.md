# ADR-0031: Los datos sobreviven a una recarga mientras la pestaña está abierta

- **Estado:** aceptado
- **Fecha:** 2026-11-02
- **Modifica:** ADR-0010, ADR-0029

## Contexto

La BD del usuario vivía solo en la memoria del worker: recargar la página (F5, Ctrl+F5) la
perdía y devolvía a la landing (ADR-0029). Se quiere que los datos sigan vivos mientras la
pestaña esté abierta y que solo se pierdan al cerrarla o al pulsar un botón «Salir», avisando
antes de que lo no guardado se perderá.

Hay dos límites de los navegadores:

- Para sobrevivir a una recarga, la BD tiene que copiarse fuera de la memoria de la pestaña.
- Al cerrar o recargar una pestaña solo se puede pedir el aviso genérico del navegador
  (`beforeunload`): no admite un texto propio y no distingue cerrar de recargar.

## Decisión

- **Una copia por pestaña en OPFS.** Tras cada cambio de la BD del usuario, al abrirla y al
  cargar un fichero, el worker la serializa y la escribe en `sesiones/sesion-<id>-<a|b>.db`, con
  un acceso síncrono (`createSyncAccessHandle`). Escribe en la ranura que no tiene la última copia,
  así que si se recarga a mitad de escritura queda la anterior. Al retomar, cada copia se
  comprueba como un fichero cargado (ADR-0010) y se usa la primera que valga. Las copias seguidas
  se agrupan: mientras se escribe una, los cambios siguientes producen una sola más.
- **Lo que recuerda la pestaña va en `sessionStorage`** (`astrofinance.session`): el id de la
  pestaña, la ranura de la última copia y si hay datos del usuario y cambios sin descargar. No
  contiene datos financieros. `sessionStorage` es de la pestaña, sobrevive a la recarga y se
  borra al cerrarla, así que una pestaña nueva empieza en la landing.
- **Recargar retoma.** `TabSession.start()`, al arrancar `App`, abre la copia en lugar de la
  landing. Mientras tanto se ve «Recuperando tus datos…». Si la copia no vale o falta, se borra y
  se ve la landing.
- **La demo no se copia** (ADR-0006 sin cambios): recargarla vuelve a la landing.
- **Cerrar la pestaña.** Al cerrarla no se puede borrar nada de forma fiable, así que cada pestaña
  tiene un Web Lock (`astrofinance.session.<id>`) mientras está abierta. Al arrancar, cada pestaña
  borra, pasado un minuto, las copias cuyo cerrojo no tiene nadie: las de pestañas cerradas. El
  minuto deja que una pestaña que se está recargando (y suelta su cerrojo un momento) lo recupere.
  Una pestaña duplicada hereda el id de la original. Como el cerrojo lo tiene la original, la
  duplicada toma un id nuevo, retoma los datos de la original y a partir de ahí guarda los suyos.
- **«Salir»**, al pie del menú lateral con los datos del usuario abiertos (`ExitButton`; en el
  menú plegado, solo el icono). Abre un diálogo propio: «¿Salir de AstroFinance?», que se
  cerrarán los datos y que se perderá lo que no esté en una copia descargada, o que hay cambios
  sin descargar si los hay. Al confirmar se cierra la BD, se borra la copia y se vuelve a la
  landing.
- **Aviso del navegador solo con cambios sin descargar.** `DbService.unsavedChanges` se activa con
  cada cambio y se apaga al descargar una copia, al cargar un fichero y al empezar sin datos. Con
  la BD del usuario abierta y cambios sin descargar, `beforeunload` pide el aviso genérico del
  navegador. Sale también al recargar, aunque los datos sobrevivan: el navegador no distingue.
- **Sin OPFS o sin Web Locks** (navegadores antiguos, algunos modos privados, el WebKit de
  Playwright en Windows) no hay copia. Todo funciona como antes y recargar vuelve a la landing.

## Consecuencias

- Recargar ya no cuesta los datos. Los e2e lo comprueban en `session.spec.ts`, que se salta donde
  no hay OPFS. Los que recargaban para volver a la landing ahora salen con «Salir»
  (`exitApp` en `e2e/fixtures.ts`).
- Tras cerrar la pestaña, su copia sigue en disco, sin cifrar, hasta que se abre otra vez la
  aplicación en ese navegador (o el navegador borra el almacenamiento). Es el mismo riesgo que la
  copia descargada (ADR-0010), pero en el perfil del navegador. «Salir» la borra en el acto.
- Cada cambio reescribe la copia entera. Con BD de pocos MB es inmediato; si crecieran mucho,
  habría que espaciar las copias.
- Si se recarga en los milisegundos entre un cambio y su copia, ese cambio se pierde.
- No sustituye al guardado persistente en OPFS (T2.7–T2.8): esta copia es de la pestaña y se
  borra al salir. Cuando llegue aquel, esta sesión podrá apoyarse en él.
