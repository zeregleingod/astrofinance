# ADR-0003: SheetJS desde la fuente oficial, vendorizado

- **Estado:** aceptado
- **Fecha:** 2026-10-07

## Contexto

El paquete `xlsx` del registro npm está congelado en la 0.18.5 y tiene vulnerabilidades conocidas
(prototype pollution, ReDoS). SheetJS solo publica versiones nuevas en `cdn.sheetjs.com`.

## Decisión

- Tarball oficial `vendor/xlsx-0.20.3.tgz`, descargado de
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` y **versionado en el repositorio**.
- SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
- Dependencia declarada como `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`: `npm ci` no accede al CDN.
- Solo se usa dentro de `workers/` (frontera impuesta por ESLint); los ficheros del banco se tratan
  como entrada no confiable (T6.1).

## Consecuencias

- Actualizar = descargar el nuevo tarball, comprobar su hash, sustituir el fichero y actualizar
  este ADR.
- `npm audit` no cubre este paquete: revisar manualmente los avisos de seguridad de SheetJS.
