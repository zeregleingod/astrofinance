# ADR-0004: Identidad visual y tema claro/oscuro conmutable

- **Estado:** aceptado
- **Fecha:** 2026-10-08

## Contexto

El tema por defecto de Material 3 (paleta azure, Roboto) resultaba genérico. Se quiere un estilo
de panel financiero moderno: fondo lavanda suave, tarjetas blancas redondeadas, acento índigo y
barra lateral blanca. Además el usuario debe poder pasar de modo claro a oscuro con un clic, sin
recargar.

## Decisión

- Se mantiene Angular Material 3 y se personaliza con tokens:
  - Paleta propia generada con `ng generate @angular/material:theme-color` (primario `#4F4BC9`,
    terciario `#F0965A`, neutro `#5E6080`) en `src/styles/_theme-colors.scss`.
  - Superficies sobrescritas con `light-dark()`: fondo `#F2F3FA` / `#12131D`, tarjetas y barra
    lateral `#FFFFFF` / `#1B1C2A`; esquinas de 16 px y tarjetas sin sombra.
  - Tipografía Poppins (400/500/600) autoalojada con `@fontsource/poppins`.
- `ThemeService` (`@core/theme`) pone `theme-light` o `theme-dark` en `<html>`, que fija
  `color-scheme`; los tokens de Material se recalculan al instante. La elección se guarda en
  `localStorage` (`astrofinance.theme`); sin elección previa se sigue el modo del sistema.
- El interruptor «Modo oscuro» está al pie de la barra lateral (`mat-slide-toggle`, rol `switch`).

## Consecuencias

- Cambio de tema inmediato y sin dependencias nuevas salvo la fuente.
- Puede haber un destello del modo del sistema antes de arrancar Angular si difiere del guardado:
  la CSP impide un script inline que lo evite.
- Los colores nuevos deben pasar por tokens `--mat-sys-*` para funcionar en ambos modos.
