import { DOCUMENT, Service, computed, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

/** Clave de `localStorage` con la preferencia de tema (no contiene datos financieros). */
export const THEME_STORAGE_KEY = 'astrofinance.theme';

/**
 * Modo claro/oscuro de la aplicación. Aplica la clase `theme-light` o
 * `theme-dark` en `<html>`, que fija `color-scheme` y con él todos los tokens
 * de Material (`light-dark()`), así que el cambio es inmediato y sin recargar.
 * La elección se recuerda; sin elección previa se sigue el modo del sistema.
 */
@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = this.document.defaultView?.localStorage;
  private readonly modeState = signal<ThemeMode>(this.initialMode());

  readonly mode = this.modeState.asReadonly();
  readonly isDark = computed(() => this.mode() === 'dark');

  constructor() {
    this.apply(this.mode());
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  set(mode: ThemeMode): void {
    this.modeState.set(mode);
    this.apply(mode);
    try {
      this.storage?.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Almacenamiento bloqueado: el cambio vale solo para esta sesión.
    }
  }

  private initialMode(): ThemeMode {
    let stored: string | null = null;
    try {
      stored = this.storage?.getItem(THEME_STORAGE_KEY) ?? null;
    } catch {
      // Almacenamiento bloqueado: se usa el modo del sistema.
    }
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    const prefersDark = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    return prefersDark?.matches ? 'dark' : 'light';
  }

  private apply(mode: ThemeMode): void {
    const classes = this.document.documentElement.classList;
    classes.toggle('theme-dark', mode === 'dark');
    classes.toggle('theme-light', mode === 'light');
  }
}
