# ADR-0032: Política de privacidad dentro de la aplicación

- **Estado:** aceptado
- **Fecha:** 2026-11-02

## Contexto

La aplicación es 100 % offline (ADR-0002) y los datos solo viven en el dispositivo (ADR-0010,
ADR-0031). Se quiere contarlo con transparencia en una política de privacidad, que se pueda leer
antes de entrar (sin BD abierta) y también desde dentro. Se publica en GitHub Pages (`github.io`)
y no hay responsable ni contacto: el uso es responsabilidad de cada usuario y las dudas y errores
van a los _issues_ del repositorio.

## Decisión

- **Ruta `/privacidad`** (`pages/privacy/privacy-page`), fuera del menú (`data.nav: false`).
  Con BD abierta se ve en el armazón, como cualquier página.
- **Páginas públicas.** Sin BD, `App` no enseña la landing en las rutas públicas
  (`isPublicUrl`, `PublicRoute` en `pages/shell/public-route.ts`), sino `PublicFrame`: la barra de
  la landing (marca, idioma, tema), «Volver al inicio» y la página de la ruta. El título de la
  pestaña es el de la página («Privacidad · AstroFinance»), no solo el nombre de la aplicación.
- **Enlaces:** al pie de la landing y al pie del menú lateral (en el menú plegado, solo el icono
  con su aviso).
- **Textos en los diccionarios** (`TEXTS.privacy`, es/en/ca), con una plantilla explícita por
  apartado: sin `innerHTML`, las listas son arrays y las claves del navegador van en `<code>`.
  El único enlace externo es la Declaración de privacidad de GitHub, en el idioma de la interfaz,
  con `target="_blank"` y `rel="noopener noreferrer"`. Navegar a él no es una petición de la
  aplicación: la CSP (`connect-src 'self'`) no cambia.
- **`PRIVACIDAD.md`** en la raíz del repositorio es la misma política en Markdown.

## Consecuencias

- Si cambia el tratamiento de los datos (Google Drive, cifrado, PWA, una clave nueva en
  `localStorage`), hay que actualizar a la vez los tres diccionarios, `PRIVACIDAD.md` y la fecha
  de «Última actualización», antes de publicarlo.
- Añadir otra página pública es añadir su ruta y reconocerla en `isPublicUrl`.
- GitHub Pages no permite cabeceras HTTP propias: la CSP y la política de _referrer_ se aplican
  por `<meta>` en `index.html`; `frame-ancestors`, `Permissions-Policy`, `X-Content-Type-Options`
  y HSTS de `docs/security/headers.md` no. La política no promete lo que dependería de ellas.
