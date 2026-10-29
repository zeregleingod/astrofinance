# Astrofinance

> Easy personal finance management to make life easier.

Gestor financiero personal **100 % offline**: Angular 22 (standalone, zoneless, Signals) ·
Angular Material · SQLite WASM en Web Worker + OPFS · PWA · SheetJS · Vitest · Playwright.

Plan de trabajo: [implementation.md](implementation.md) · Decisiones: [docs/adr/](docs/adr/).

## Requisitos

- Node **24.19.0** (ver `.nvmrc`) y npm 11.
- Navegadores de Playwright para los e2e: `npm run e2e:install`.

## Puesta en marcha

```bash
npm ci
npm start            # http://localhost:4200
```

## Scripts

| Script                            | Qué hace                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `npm start`                       | Servidor de desarrollo                                                         |
| `npm run build`                   | Build de producción en `dist/astrofinance/browser`                             |
| `npm test`                        | Tests unitarios (Vitest) con cobertura; falla si `domain/` < 90 %              |
| `npm run test:watch`              | Tests en modo _watch_                                                          |
| `npm run lint`                    | ESLint (0 avisos permitidos)                                                   |
| `npm run lint:boundaries`         | Comprueba que ESLint rechaza los imports prohibidos entre capas                |
| `npm run typecheck`               | `tsc` estricto sobre app, tests y e2e                                          |
| `npm run format` / `format:check` | Prettier                                                                       |
| `npm run e2e`                     | Playwright (Chromium, Firefox, WebKit, móvil) contra el build de producción    |
| `npm run serve:dist`              | Sirve el build con las cabeceras de seguridad de producción (puerto 4300)      |
| `npm run audit`                   | `npm audit`, falla con vulnerabilidades altas                                  |
| `npm run ci`                      | Todo lo anterior en orden: formato → lint → tipos → unit → build → e2e → audit |

## Estructura

```
src/app/
  domain/     Reglas de negocio en TypeScript puro (sin Angular)
  worker/     Web Workers: SQLite WASM + OPFS, lectura de extractos (solo importan domain)
  services/   Estado y datos de la app en el hilo principal, sin UI ni textos
  ui/         Piezas visuales reutilizables y textos visibles (ui/texts.ts)
  pages/      Una carpeta por pantalla (lazy) y shell/, el armazón común
e2e/          Tests Playwright (fixtures con garantía de "cero red")
docs/adr/     Architecture Decision Records
docs/security Cabeceras de seguridad para el hosting
tools/        Scripts de soporte (servidor estático, verificación de fronteras)
vendor/       SheetJS oficial vendorizado (ADR-0003)
```

Las dependencias van en un solo sentido (`pages → ui | services → worker → domain`). Las reglas
están en [ADR-0025](docs/adr/0025-estructura-de-carpetas.md) y las impone ESLint.
