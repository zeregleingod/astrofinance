# services

Estado y datos de la app en el hilo principal (Angular), sin UI: la BD (`db/`), la importación
(`import/`), la copia de seguridad, el mes y año elegidos, el tema, el tamaño de la ventana…

- Importa `domain` y, de `worker`, solo `*-api.ts` y `rpc/protocol.ts`.
- No importa `ui` ni `pages`: no produce textos ni abre diálogos. Devuelve datos o códigos y la
  UI los traduce.
