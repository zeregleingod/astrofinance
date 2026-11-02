import { signal } from '@angular/core';

/**
 * Idiomas de la interfaz (ADR-0027), en el orden en que se ofrecen en todas partes. El primero es
 * el predeterminado.
 */
export const LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'ca', name: 'Català' },
  { code: 'en', name: 'English' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: Language = 'es';

/** Clave de `localStorage` con el idioma elegido (no contiene datos financieros). */
export const LANGUAGE_STORAGE_KEY = 'astrofinance.language';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value);
}

const state = signal<Language>(storedLanguage() ?? DEFAULT_LANGUAGE);

/**
 * El idioma de la interfaz. Es una señal: lo que lee `TEXTS` en una plantilla o un `computed`
 * se vuelve a pintar al cambiarlo, sin recargar.
 */
export const language = state.asReadonly();

/** Cambia el idioma de toda la interfaz y lo recuerda para la próxima vez. */
export function setLanguage(next: Language): void {
  state.set(next);
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // Almacenamiento bloqueado: el cambio vale solo para esta sesión.
  }
}

function storedLanguage(): Language | null {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    // Almacenamiento bloqueado: se usa el predeterminado.
    return null;
  }
}
