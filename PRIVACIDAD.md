# Política de privacidad de AstroFinance

**Última actualización:** 2 de noviembre de 2026

Esta misma política se puede leer dentro de la aplicación, en «Privacidad» (`/privacidad`), en
español, inglés y catalán. Si cambia, se actualizan las dos a la vez
([ADR-0032](docs/adr/0032-politica-de-privacidad.md)).

## En pocas palabras

AstroFinance funciona entero en tu navegador. **Tus datos financieros no salen de tu dispositivo**:
no hay servidor que los reciba, no hay cuentas de usuario, no hay analítica, no hay publicidad y no
hay cookies. Nadie más que tú puede ver, copiar o vender tus datos, porque la aplicación nunca los
envía a ningún sitio.

No es solo una promesa: la aplicación está construida para que no pueda hacerlo, y puedes
comprobarlo tú mismo (lo explicamos [más abajo](#5-cómo-puedes-comprobarlo)).

## 1. Uso bajo tu responsabilidad

AstroFinance es software libre, publicado con licencia MIT y ofrecido **tal cual, sin garantías de
ningún tipo** (ver [`LICENSE`](LICENSE)). No hay ninguna empresa ni persona detrás que reciba,
guarde o trate tus datos: la aplicación es una herramienta que se ejecuta en tu dispositivo y tú
decides qué metes en ella y dónde guardas tus copias.

Por eso, el uso de la aplicación y la custodia de tus datos y ficheros son responsabilidad de cada
usuario.

**Dudas y errores:** si tienes una pregunta sobre esta política o encuentras un fallo, ábrelo en la
sección _Issues_ del repositorio de AstroFinance en GitHub. Los _issues_ son públicos: **no incluyas
nunca datos financieros reales**, extractos ni ficheros `.db`.

## 2. Qué datos maneja la aplicación y dónde quedan

### Tus datos financieros

Cuentas, movimientos, categorías, reglas, notas y repartos que creas o importas. Viven en una base
de datos SQLite que se ejecuta dentro de tu navegador. Pueden estar en tres sitios, y los tres son
tuyos:

| Dónde                                           | Cuándo                                                                     | Cuánto dura                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Memoria de la pestaña**                       | Mientras usas la aplicación                                                | Hasta que cierras la pestaña o pulsas «Salir»                                                                      |
| **Almacenamiento privado del navegador** (OPFS) | Una copia de la pestaña, para que una recarga no te haga perder el trabajo | Se borra al pulsar «Salir»; si cierras la pestaña sin más, la próxima vez que abras la aplicación en ese navegador |
| **Fichero `.db` que descargas**                 | Solo cuando tú pulsas «Descargar copia»                                    | Lo que tú decidas: es un fichero tuyo, en la carpeta que elijas                                                    |

**Importante:** en esta versión ni la copia del navegador ni el fichero descargado están cifrados.
Cualquiera con acceso a tu dispositivo, a tu perfil del navegador o al fichero podría leerlos.
Guarda el `.db` en un lugar seguro, como harías con un extracto bancario en papel. El cifrado
opcional está previsto en el plan del proyecto.

### Extractos bancarios que importas

Cuando importas un extracto (Excel o CSV de tu banco), el fichero se lee **en tu navegador**; no se
sube a ningún sitio. De él se conserva solo lo necesario:

- Fecha, importe, concepto y saldo de cada movimiento.
- Los **4 últimos dígitos del IBAN**, para distinguir tus cuentas. **Nunca** se guarda el IBAN
  completo ni el nombre del titular.
- El nombre del fichero y su huella SHA-256, para avisarte si importas el mismo extracto dos veces.

Ten en cuenta que los conceptos los escribe tu banco y a veces incluyen nombres de terceros (por
ejemplo, quién te envió un Bizum). Se guardan tal cual, también solo en tu dispositivo.

### Preferencias de la interfaz

En el `localStorage` de tu navegador se guardan tres preferencias, ninguna con datos financieros:

- `astrofinance.language`: el idioma elegido.
- `astrofinance.theme`: modo claro u oscuro.
- `astrofinance.sidebar`: si el menú lateral está plegado.

En el `sessionStorage` (que el navegador borra al cerrar la pestaña) se guarda
`astrofinance.session`: un identificador aleatorio de la pestaña, cuál es la última copia guardada
y si hay cambios sin descargar. Tampoco contiene datos financieros.

Esto no son cookies, no se envía a ningún servidor y solo sirve para que la aplicación funcione como
le has pedido. Por eso no se muestra ningún aviso de consentimiento: no hay nada que consentir.

### El modo demo

La demo usa datos inventados («Alex», bancos y comercios «Demo») que se crean en memoria. No toca tu
almacenamiento ni se mezcla con tus datos, y desaparece al salir o al recargar.

## 3. Lo que la aplicación no hace

- No hay registro, cuentas ni inicio de sesión.
- No hay analítica, telemetría, informes de errores automáticos ni píxeles de seguimiento.
- No hay publicidad ni se comparten o venden datos con terceros.
- No se cargan recursos de terceros: ni CDN, ni Google Fonts, ni scripts externos. Las fuentes y los
  iconos van incluidos en la propia aplicación.
- No usa ni pide permiso para la cámara, el micrófono, la ubicación, los pagos ni el USB.
- No hay inteligencia artificial ni servicios externos que analicen tus movimientos: las sugerencias
  de categoría se calculan en tu navegador a partir de tu propio historial.

## 4. El alojamiento: GitHub Pages

La aplicación se sirve desde **GitHub Pages** (`github.io`). Para usarla, tu navegador descarga de
allí los ficheros de la aplicación (HTML, JavaScript, estilos). Como cualquier web, GitHub registra
datos técnicos de esa visita, como tu dirección IP, por motivos de seguridad. Esos registros son de
GitHub, no del proyecto, que no tiene acceso a ellos ni los usa para nada. Se rigen por la
[Declaración de privacidad de GitHub](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement).

Esa descarga es la **única** comunicación con la red. Una vez cargada, la aplicación no hace ninguna
otra petición: la política de seguridad del contenido (CSP) incluida en la propia página le impide
al navegador conectarse con cualquier otro origen. Tampoco se envía la dirección de la página a
otros sitios (`referrer: no-referrer`).

## 5. Cómo puedes comprobarlo

1. Abre las herramientas de desarrollo de tu navegador (F12) y ve a la pestaña **Red**.
2. Usa la aplicación: importa un extracto, categoriza, descarga una copia.
3. Verás que todas las peticiones van al mismo dominio de la aplicación y que ninguna lleva tus
   datos.

Además, el código es abierto: las decisiones de seguridad y privacidad están documentadas en
[`docs/adr/`](docs/adr/) (en especial la
[ADR-0002, «cero red»](docs/adr/0002-politica-de-seguridad-y-red.md)) y en
[`docs/security/headers.md`](docs/security/headers.md). Las pruebas automáticas fallan si la
aplicación intenta conectarse con cualquier origen externo.

## 6. Cómo borrar tus datos

Como los datos están en tu dispositivo, eres tú quien los controla:

- **«Salir»** (al pie del menú lateral) cierra tus datos y borra la copia del navegador en el acto.
  Si tienes cambios sin descargar, te avisa antes.
- **Borrar los datos del sitio** desde la configuración del navegador elimina todo lo anterior,
  preferencias incluidas.
- **Los ficheros `.db` descargados** se borran como cualquier otro fichero de tu ordenador.

Nadie puede borrar, recuperar ni exportar tus datos por ti, porque no están en ningún otro sitio.
Por la misma razón, si pierdes tu fichero `.db` y no hay copia en el navegador, no hay forma de
recuperarlos: descarga copias con regularidad.

## 7. Control total sobre tus datos

Los derechos que reconoce el Reglamento General de Protección de Datos (acceso, rectificación,
supresión, portabilidad…) los ejerces directamente desde la aplicación, sin pedírselo a nadie: ves y
editas todos tus datos, los borras con «Salir» y te los llevas en un fichero `.db` estándar de
SQLite, que puedes abrir con cualquier herramienta compatible.

## 8. Menores

AstroFinance no está dirigida a menores de 14 años. Aun así, como la aplicación no recoge datos de
nadie, tampoco recoge los suyos.

## 9. Cambios en esta política

Si alguna vez la aplicación cambia la forma de tratar tus datos, esta política se actualizará
**antes** de publicar ese cambio, con la fecha de arriba renovada. En concreto:

- Si se añade la sincronización con un servicio en la nube (como Google Drive, prevista a largo
  plazo), será **opcional**, la activarás tú, conectará solo con ese servicio y se explicará aquí
  con detalle qué se envía y a quién.
- Si se añade la instalación como aplicación (PWA), el navegador guardará en caché los ficheros de la
  aplicación para funcionar sin conexión; eso no cambia nada sobre tus datos.

El historial de esta política queda en el repositorio del proyecto, así que siempre puedes ver qué
cambió y cuándo.
