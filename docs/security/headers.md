# Cabeceras HTTP para el hosting estático

La app es un conjunto de ficheros estáticos. El hosting debe servir **todas** las respuestas con:

| Cabecera                       | Valor                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; manifest-src 'self'; frame-ancestors 'none'` |
| `X-Content-Type-Options`       | `nosniff`                                                                                                                                                                                                                                                                             |
| `Referrer-Policy`              | `no-referrer`                                                                                                                                                                                                                                                                         |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                                                                                                                                                                                         |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                                                                                                                                                                                         |
| `Permissions-Policy`           | `camera=(), microphone=(), geolocation=(), payment=(), usb=()`                                                                                                                                                                                                                        |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains` (solo con HTTPS)                                                                                                                                                                                                                                |

Otros requisitos:

- `.wasm` con `Content-Type: application/wasm`.
- `index.html` con `Cache-Control: no-cache`; ficheros con hash: `max-age=31536000, immutable`.
- _Fallback_ SPA: rutas desconocidas → `index.html`.
- En principio no hacen falta COOP/COEP estrictos (`require-corp`); se confirmará en el spike T2.1.

Implementación de referencia: [`tools/serve-dist.mjs`](../../tools/serve-dist.mjs) (la usan los e2e).
Justificación de cada directiva: [ADR-0002](../adr/0002-politica-de-seguridad-y-red.md).
