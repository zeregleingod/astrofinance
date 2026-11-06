# ADR-0034: Cuentas

- **Estado:** aceptado
- **Fecha:** 2026-11-06

## Contexto

Las cuentas existían desde el esquema inicial (`accounts`), pero solo las creaba la importación: una
por entidad y últimos cuatro dígitos del IBAN, llamada «Banco ·1234». El usuario no podía darlas de
alta antes de importar, ni ponerles un nombre suyo. Más adelante los movimientos se enlazarán con
las cuentas que el usuario cree; para eso primero hace falta poder crearlas.

## Decisión

- **Configuración › Cuentas** (`/configuracion/cuentas`), la primera de Configuración. Trabaja
  sobre la misma tabla `accounts`: las cuentas que crea la importación también salen aquí. No hace
  falta migración.
- **Alta:** se elige el **banco** de un desplegable y se escribe el **nombre**. Los bancos son los
  que se saben importar (`ACCOUNT_BANKS`, a partir de `BANK_PROFILES`), para que luego sus
  extractos se puedan enlazar con la cuenta. Las cuentas nuevas son corrientes.
- **Nombre:** obligatorio, de hasta 80 caracteres y único sin distinguir mayúsculas, acentos ni
  espacios repetidos, porque en los movimientos solo se ve el nombre.
- **Edición en la ficha:** el nombre se cambia siempre. El banco solo se cambia mientras la cuenta
  no tiene movimientos, porque con él se reconocen sus extractos al importar.
- **Eliminar:** solo se puede eliminar una cuenta sin movimientos ni extractos importados, y
  siempre tras confirmarlo. Con movimientos, el botón queda desactivado y explica por qué.
- **Selección del banco:** al dar de alta, el banco se elige en una rejilla de tarjetas con su
  nombre (botones de opción: se recorren con las flechas). La elegida se marca con borde, tinte y
  una marca, no solo con color. No se usan logotipos de los bancos: son marcas de terceros.
- **Diseño:** el panel de alta es como en las demás pantallas de Configuración. Debajo, una ficha
  por cuenta en tres columnas (dos en pantallas medianas y una en móvil), con el estilo de las
  fichas de movimientos (ADR-0023). Cada ficha lleva un distintivo con las iniciales del banco, el
  nombre, el banco, el final del IBAN si lo dio un extracto, cuántos movimientos tiene y las
  acciones con su nombre.
- **Importación:** si el nombre por defecto («Banco ·1234») ya lo tiene otra cuenta, la nueva se
  numera («Banco ·1234 (2)») en lugar de fallar.

## Consecuencias

- Una cuenta creada a mano todavía **no recibe** los movimientos de un extracto. La importación
  sigue buscando la cuenta por banco y final del IBAN, y si no la encuentra crea otra. El enlace
  entre extractos y cuentas es el siguiente paso.
- Un banco que no se sabe importar todavía no se puede elegir. Las cuentas antiguas que tienen otro
  banco (las de la demo, por ejemplo) lo conservan y lo enseñan.
