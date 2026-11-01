import { CA } from './i18n/ca';
import { EN } from './i18n/en';
import { ES, type Texts } from './i18n/es';
import { language, type Language } from './i18n/language';

export type { Texts } from './i18n/es';
export { LANGUAGES, language, setLanguage, type Language } from './i18n/language';

const DICTIONARIES: Readonly<Record<Language, Texts>> = { es: ES, en: EN, ca: CA };

/** Cada apartado se crea una vez: `TEXTS.imports` es siempre el mismo objeto. */
const sections = new Map<string, object>();

/**
 * Textos de la interfaz en el idioma elegido (ADR-0027). Ningún componente debe contener
 * literales visibles para el usuario fuera de los diccionarios de `ui/i18n/`.
 *
 * Cada lectura de un texto (`TEXTS.imports.title`) consulta la señal `language`, así que una
 * plantilla, un `computed` o un `effect` que lo lea se actualiza solo al cambiar de idioma.
 * Guardar un apartado (`const t = TEXTS.imports`) es seguro; guardar un texto suelto en una
 * constante lo congela en el idioma de ese momento: léelo cuando haga falta.
 */
export const TEXTS: Texts = section([]) as Texts;

/** Un apartado de los textos (o el raíz) que lee del diccionario del idioma activo. */
function section(path: readonly PropertyKey[]): object {
  const key = path.map(String).join('.');
  let view = sections.get(key);
  if (!view) {
    // El diccionario español da la forma (claves, longitud de las listas); los valores se
    // leen siempre del idioma activo.
    view = new Proxy(lookup(ES, path) as object, {
      get(_, property) {
        const value: unknown = Reflect.get(lookup(DICTIONARIES[language()], path), property);
        return typeof value === 'object' && value !== null ? section([...path, property]) : value;
      },
    });
    sections.set(key, view);
  }
  return view;
}

function lookup(dictionary: Texts, path: readonly PropertyKey[]): object {
  return path.reduce<object>((node, property) => Reflect.get(node, property) as object, dictionary);
}
