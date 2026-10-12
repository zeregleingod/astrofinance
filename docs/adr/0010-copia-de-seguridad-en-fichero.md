# ADR-0010: Copia de seguridad en fichero antes que el guardado en OPFS

- **Estado:** aceptado
- **Fecha:** 2026-10-12

## Contexto

La BD del usuario vive en memoria y se pierde al recargar la página. El plan preveía primero el
guardado en OPFS con doble ranura (T2.7–T2.8) y después importar y exportar el `.db` (T2.11–T2.12).
Exportar y cargar un fichero es mucho más pequeño, no depende de OPFS y ya permite conservar los
datos y llevarlos a otro dispositivo. Faltaba además decidir dónde ponerlo en la interfaz.

## Decisión

- **Orden.** Se adelantan T2.11 y T2.12. Hasta que exista el guardado en OPFS, descargar una copia
  es la única forma de conservar los datos.
- **Lugar.** Página «Configuración › Copia de seguridad» (`/configuracion/copia-de-seguridad`,
  `features/settings/backup-page`). Es una acción poco frecuente y cargar una copia es
  destructivo: no va en el menú principal ni en el pie de la barra lateral. Se habla de
  «descargar» y «cargar una copia», nunca de «importar», que ya significa leer un extracto.
- **Descargar** (`data/files/file-saver.ts`): fichero `astrofinance-AAAA-MM-DD.db`, sin cifrar
  (la v1 no cifra; ver Fase 10). Con File System Access API el usuario elige dónde; en el resto es
  una descarga corriente. No se ofrece en la demo ni si aún no hay nada del usuario.
- **Cargar** (`workers/db/backup.ts`): el fichero es entrada no confiable. Se comprueban tamaño
  (64 MB) y cabecera, se abre en una BD en memoria **aislada** con `trusted_schema = OFF`, y se
  exige `integrity_check`, versión no mayor que la de la app, migraciones aplicables, **esquema
  idéntico** al que dejan las migraciones en una BD nueva y `foreign_key_check` limpio. Solo
  entonces sustituye a la BD abierta; si algo falla, esta queda intacta.
- Si ya hay datos del usuario, cargar una copia pide confirmación en un diálogo. Lo cargado pasa
  a ser la BD del usuario (`mode = 'local'`), también si se estaba en la demo.

## Consecuencias

- Los datos sobreviven entre sesiones, pero a mano: hay que descargar antes de cerrar. Las
  pantallas que escriben lo avisan y remiten a esta página.
- Exigir el esquema idéntico rechaza cualquier `.db` retocado con otra herramienta (un índice o
  un trigger de más). Es deliberado: la app solo abre lo que ella misma ha escrito.
- Pendiente: comparar `db_uuid`/`revision` y avisar de copias antiguas o divergentes (con T2.8,
  cuando `revision` empiece a cambiar); avisar de cambios sin descargar al salir (T3.3); ofrecer
  «cargar una copia» en el primer arranque (T3.4); recordar la última exportación (T9.5).
