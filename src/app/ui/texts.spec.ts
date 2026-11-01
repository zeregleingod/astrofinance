import { computed } from '@angular/core';
import { CA } from './i18n/ca';
import { EN } from './i18n/en';
import { ES } from './i18n/es';
import { LANGUAGE_STORAGE_KEY } from './i18n/language';
import { LANGUAGES, TEXTS, language, setLanguage } from './texts';

/** Las rutas de todas las hojas de un diccionario (`imports.errors.fichero-vacio`). */
function keys(node: unknown, path = ''): string[] {
  if (typeof node !== 'object' || node === null) return [path];
  return Object.entries(node).flatMap(([key, value]) => keys(value, `${path}.${key}`));
}

describe('TEXTS', () => {
  afterEach(() => {
    setLanguage('es');
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  it('el español es el idioma predeterminado', () => {
    expect(LANGUAGES[0].code).toBe('es');
    expect(language()).toBe('es');
    expect(TEXTS.imports.title).toBe('Importar extracto');
  });

  it('cada idioma tiene exactamente las mismas claves que el español', () => {
    expect(keys(EN)).toEqual(keys(ES));
    expect(keys(CA)).toEqual(keys(ES));
  });

  it('lee cada texto en el idioma de ese momento, también desde un apartado guardado', () => {
    const t = TEXTS.imports;

    setLanguage('en');

    expect(t.title).toBe('Import statement');
    expect(TEXTS.imports.errors['fichero-vacio']).toBe('The file is empty.');
  });

  it('un computed que lee un texto se recalcula al cambiar de idioma', () => {
    const title = computed(() => TEXTS.dashboard.title);
    expect(title()).toBe('Resumen');

    setLanguage('en');

    expect(title()).toBe('Overview');
  });

  it('las listas se recorren y copian en el idioma activo', () => {
    setLanguage('en');

    expect(TEXTS.period.months.map((name) => name.slice(0, 3))).toEqual([
      ...TEXTS.period.monthsShort,
    ]);
    expect({ ...TEXTS.datepicker }.calendarLabel).toBe('Calendar');
  });

  it('en catalán', () => {
    setLanguage('ca');

    expect(TEXTS.imports.title).toBe('Importa un extracte');
  });

  it('un apartado es siempre el mismo objeto', () => {
    expect(TEXTS.transactions.links).toBe(TEXTS.transactions.links);
  });

  it('recuerda el idioma elegido', () => {
    setLanguage('en');

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
});
