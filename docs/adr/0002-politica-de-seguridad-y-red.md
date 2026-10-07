# ADR-0002: Política de seguridad del contenido y "cero red"

- **Estado:** aceptado
- **Fecha:** 2026-10-07

## Contexto

La app maneja datos financieros y no necesita ningún servicio externo. Un fallo (dependencia
comprometida, XSS) no debe poder exfiltrar datos.

## Decisión

CSP declarada en `src/index.html` (meta) **y** como cabecera HTTP en el hosting
(ver [`docs/security/headers.md`](../security/headers.md); `tools/serve-dist.mjs` es la
referencia ejecutable):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self';
connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none';
manifest-src 'self'; frame-ancestors 'none' (solo en cabecera)
```

Desviaciones respecto al plan (T0.7) y su motivo:

1. **`connect-src 'self'` en lugar de `'none'`**: SQLite WASM descarga su `.wasm` con `fetch` y el
   Service Worker (Fase 9) precarga recursos del mismo origen. `'self'` sigue impidiendo cualquier
   conexión a terceros.
2. **`style-src 'unsafe-inline'`**: Angular inserta los estilos de componentes como elementos
   `<style>` en tiempo de ejecución. Sin servidor que genere _nonces_ por petición, un nonce fijo
   no aporta seguridad real. El riesgo es acotado: el CSS no ejecuta código y `script-src` sigue
   siendo estricto. El e2e (`e2e/app.spec.ts`) verifica que `script-src` nunca contiene
   `'unsafe-inline'` ni `'unsafe-eval'`.
3. **Sin Subresource Integrity**: Angular lo implementa con un `<script type="importmap">` inline,
   que `script-src 'self'` bloquearía. Todos los recursos son del mismo origen.
4. **`inlineCritical: false`**: el CSS crítico inline usa un atributo `onload` que la CSP bloquearía.

Además:

- Fuentes autoalojadas (Roboto y Material Symbols desde `node_modules`). `ng add @angular/material`
  añade Google Fonts por defecto: no volver a hacerlo.
- ESLint prohíbe `innerHTML`/`outerHTML`, `bypassSecurityTrust*`, `eval` y `new Function`.
- La fixture común de Playwright (`e2e/fixtures.ts`) aborta toda petición fuera del origen y
  falla el test si se produce alguna o si la página registra errores (incluidas violaciones de CSP).

## Consecuencias

- Integrar Google Drive (Fase 11) exigirá un ADR nuevo y relajar `connect-src` solo para ese origen.
