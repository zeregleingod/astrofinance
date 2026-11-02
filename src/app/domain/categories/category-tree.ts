import type { CategoryKind } from './category-kind';

export const CATEGORY_KINDS = [
  'gasto',
  'ingreso',
  'ahorro',
] as const satisfies readonly CategoryKind[];

export const CATEGORY_NAME_MAX = 60;

/** Colores que se proponen para una categoría nueva, en orden. */
export const CATEGORY_COLORS = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#84CC16',
  '#F97316',
] as const;

/**
 * El nombre de una categoría en los demás idiomas de la interfaz, por código (`ca`, `en`…), sin
 * vacíos (ADR-0028, ADR-0030). Los idiomas que no aparecen usan el nombre de origen.
 */
export type CategoryTranslations = Readonly<Record<string, string>>;

/** Idioma del nombre de una categoría que se guarda sin decir en qué idioma está. */
export const CATEGORY_SOURCE_LANGUAGE = 'es';

/** Los nombres de una categoría: el de origen y sus traducciones. */
export interface CategoryNames {
  /**
   * El nombre en el idioma en que se escribió (`sourceLanguage` de la categoría); se ve en los
   * idiomas sin traducción.
   */
  readonly sourceName: string;
  readonly translations: CategoryTranslations;
}

/** Idiomas distintos que puede traducir una categoría: de sobra para los de la interfaz. */
export const CATEGORY_TRANSLATIONS_MAX = 16;

/** Categoría tal como se guarda: las principales no tienen `parentId` ni tipo (ADR-0009). */
export interface CategoryRecord extends CategoryNames {
  readonly id: number;
  readonly parentId: number | null;
  /** En el idioma de la interfaz: su traducción o, si no la tiene, el nombre de origen. */
  readonly name: string;
  /** El idioma de `sourceName`. */
  readonly sourceLanguage: string;
  readonly kind: CategoryKind | null;
  readonly color: string | null;
  /** Movimientos que la tienen asignada directamente. */
  readonly transactionCount: number;
}

/** A lo que se asignan los movimientos; su tipo decide si cuentan como ingreso o gasto. */
export interface Subcategory extends CategoryNames {
  readonly id: number;
  readonly name: string;
  readonly sourceLanguage: string;
  readonly kind: CategoryKind;
  readonly transactionCount: number;
}

/** Categoría principal: agrupa subcategorías y les da color. */
export interface CategoryGroup extends CategoryNames {
  readonly id: number;
  readonly name: string;
  readonly sourceLanguage: string;
  readonly color: string | null;
  /** Movimientos asignados a la principal, sin contar los de sus subcategorías. */
  readonly transactionCount: number;
  readonly subcategories: readonly Subcategory[];
}

/**
 * Alta de una categoría principal (con color) o de una subcategoría (con tipo). `name` es el
 * nombre de origen, en `language` (sin él, `CATEGORY_SOURCE_LANGUAGE`); las traducciones son
 * opcionales.
 */
export type NewCategory = (
  | { readonly parentId: null; readonly name: string; readonly color: string | null }
  | { readonly parentId: number; readonly name: string; readonly kind: CategoryKind }
) & { readonly language?: string; readonly translations?: CategoryTranslations };

/**
 * Cambios en una categoría principal (nombre y color) o en una subcategoría (nombre y tipo). Sin
 * `language`, el nombre sigue en el idioma que tenía. Con `translations` se sustituyen todas sus
 * traducciones; sin ellas, se quedan como estaban.
 */
export type CategoryUpdate = (
  | { readonly id: number; readonly name: string; readonly color: string | null }
  | { readonly id: number; readonly name: string; readonly kind: CategoryKind }
) & { readonly language?: string; readonly translations?: CategoryTranslations };

/**
 * Nuevo orden de las hermanas de un nivel: las principales (`parentId: null`) o las
 * subcategorías de una misma principal. `ids` lleva todas, de la primera a la última.
 */
export interface CategoryOrder {
  readonly parentId: number | null;
  readonly ids: readonly number[];
}

const NAME_ERROR_CODES = ['nombre-vacio', 'nombre-largo', 'nombre-repetido'] as const;
const TRANSLATION_ERROR_CODES = ['traduccion-larga', 'traduccion-repetida'] as const;

export const CATEGORY_ERROR_CODES = [
  ...NAME_ERROR_CODES,
  ...TRANSLATION_ERROR_CODES,
  'principal-inexistente',
  'categoria-inexistente',
  'orden-desfasado',
] as const;

export type CategoryNameErrorCode = (typeof NAME_ERROR_CODES)[number];
export type CategoryTranslationErrorCode = (typeof TRANSLATION_ERROR_CODES)[number];
export type CategoryErrorCode = (typeof CATEGORY_ERROR_CODES)[number];

/** Error que impide guardar una categoría. `message` es el código: sobrevive al paso entre hilos. */
export class CategoryError extends Error {
  override readonly name = 'CategoryError';

  constructor(readonly code: CategoryErrorCode) {
    super(code);
  }
}

/** El código de un `CategoryError`, también si ha cruzado entre hilos; si no, `null`. */
export function categoryErrorCode(error: unknown): CategoryErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'CategoryError') return null;
  return CATEGORY_ERROR_CODES.find((code) => code === error.message) ?? null;
}

/**
 * Por qué no vale un nombre, o `null` si vale. No puede repetirse entre hermanas (las
 * principales entre sí, o las subcategorías de una misma principal), sin distinguir mayúsculas.
 */
export function categoryNameError(
  name: string,
  siblingNames: readonly string[],
): CategoryNameErrorCode | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'nombre-vacio';
  if (trimmed.length > CATEGORY_NAME_MAX) return 'nombre-largo';
  const key = nameKey(trimmed);
  return siblingNames.some((sibling) => nameKey(sibling) === key) ? 'nombre-repetido' : null;
}

/** Un código de idioma de dos letras en minúscula (`es`, `en`, `ca`), como los de la interfaz. */
export function isLanguageCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z]{2}$/.test(value);
}

/** El nombre de una categoría en `language`: su traducción o, si no la tiene, el de origen. */
export function localizedName(names: CategoryNames, language: string): string {
  return names.translations[language] ?? names.sourceName;
}

/**
 * Las traducciones que se guardan: sin espacios sobrantes, sin las vacías y sin la del idioma de
 * origen, que es el propio nombre. Las que se escriben igual que el nombre sí: dicen que ese
 * idioma está traducido.
 */
export function cleanTranslations(
  sourceLanguage: string,
  translations: CategoryTranslations,
): CategoryTranslations {
  return Object.fromEntries(
    Object.entries(translations)
      .map(([language, name]) => [language, name.trim()] as const)
      .filter(([language, name]) => name !== '' && language !== sourceLanguage),
  );
}

/** Los nombres de una categoría como se guardan: el de origen, su idioma y las traducciones. */
export interface SourcedNames {
  readonly language: string;
  readonly name: string;
  readonly translations: CategoryTranslations;
}

/**
 * Reparte los nombres escritos en cada idioma (ADR-0030). El de origen es el del primer idioma de
 * `preferred` que tenga nombre (el que ya tenía, el de la interfaz…) o, si ninguno, el primero
 * escrito; los demás son sus traducciones. `null` si no hay ninguno escrito.
 */
export function sourcedNames(
  names: Readonly<Record<string, string>>,
  preferred: readonly string[],
): SourcedNames | null {
  const filled = Object.entries(names)
    .map(([language, name]) => [language, name.trim()] as const)
    .filter(([, name]) => name !== '');
  const source =
    preferred.flatMap((code) => filled.filter(([language]) => language === code))[0] ?? filled[0];
  if (!source) return null;
  const [language, name] = source;
  return {
    language,
    name,
    translations: Object.fromEntries(filled.filter(([code]) => code !== language)),
  };
}

/** Los idiomas de `languages` sin nombre propio de la categoría: en ellos se ve el de origen. */
export function untranslatedLanguages<T extends string>(
  category: CategoryNames & { readonly sourceLanguage: string },
  languages: readonly T[],
): T[] {
  return languages.filter(
    (language) => language !== category.sourceLanguage && !(language in category.translations),
  );
}

/**
 * Por qué no vale la traducción a `language` de una categoría, o `null` si vale (vacía también:
 * es no traducirla). No puede coincidir con el nombre que tiene en ese idioma una hermana.
 */
export function categoryTranslationError(
  translation: string,
  language: string,
  siblings: readonly CategoryNames[],
): CategoryTranslationErrorCode | null {
  const trimmed = translation.trim();
  if (trimmed === '') return null;
  if (trimmed.length > CATEGORY_NAME_MAX) return 'traduccion-larga';
  const key = nameKey(trimmed);
  return siblings.some((sibling) => nameKey(localizedName(sibling, language)) === key)
    ? 'traduccion-repetida'
    : null;
}

/**
 * Por qué no valen los nombres de una categoría, o `null` si valen: el nombre de origen no puede
 * repetirse entre hermanas, ni ninguno de sus nombres en un idioma con el de una hermana en ese
 * mismo idioma. Si choca el nombre de origen (en un idioma que no traduce), el error es suyo.
 */
export function categoryNamesError(
  names: CategoryNames,
  siblings: readonly CategoryNames[],
): CategoryErrorCode | null {
  const nameError = categoryNameError(
    names.sourceName,
    siblings.map((sibling) => sibling.sourceName),
  );
  if (nameError) return nameError;
  for (const [language, translation] of Object.entries(names.translations)) {
    const error = categoryTranslationError(translation, language, siblings);
    if (error) return error;
  }
  const own = nameKey(names.sourceName);
  const clash = siblings.some((sibling) =>
    Object.entries(sibling.translations).some(
      ([language, name]) => !(language in names.translations) && nameKey(name) === own,
    ),
  );
  return clash ? 'nombre-repetido' : null;
}

/** Un color `#RRGGBB`, como los da `<input type="color">`. */
export function isCategoryColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** El primer color propuesto que aún no usa ninguna categoría; si se agotan, se repiten. */
export function nextCategoryColor(used: readonly (string | null)[]): string {
  const taken = new Set(used.map((color) => color?.toUpperCase()));
  return (
    CATEGORY_COLORS.find((color) => !taken.has(color)) ??
    CATEGORY_COLORS[used.length % CATEGORY_COLORS.length] ??
    CATEGORY_COLORS[0]
  );
}

/** Agrupa las subcategorías bajo su principal respetando el orden de entrada. */
export function buildCategoryTree(records: readonly CategoryRecord[]): CategoryGroup[] {
  return records
    .filter((record) => record.parentId === null)
    .map((group) => ({
      id: group.id,
      name: group.name,
      sourceName: group.sourceName,
      sourceLanguage: group.sourceLanguage,
      translations: group.translations,
      color: group.color,
      transactionCount: group.transactionCount,
      subcategories: records
        .filter((record) => record.parentId === group.id)
        .map(({ id, name, sourceName, sourceLanguage, translations, kind, transactionCount }) => ({
          id,
          name,
          sourceName,
          sourceLanguage,
          translations,
          // El esquema exige tipo en toda subcategoría; esto solo cubre datos imposibles.
          kind: kind ?? 'gasto',
          transactionCount,
        })),
    }));
}

/** Movimientos de una principal contando los de sus subcategorías: los que afecta borrarla. */
export function groupTransactionCount(group: CategoryGroup): number {
  return group.subcategories.reduce(
    (total, subcategory) => total + subcategory.transactionCount,
    group.transactionCount,
  );
}

/** Copia de `items` con el elemento de `from` en `to`; los índices se ajustan a la lista. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= items.length) return result;
  const [item] = result.splice(from, 1) as [T];
  result.splice(Math.min(Math.max(to, 0), result.length), 0, item);
  return result;
}

/** `ids` tiene exactamente los mismos elementos que `current`, cada uno una vez. */
export function isReorderOf(ids: readonly number[], current: readonly number[]): boolean {
  const pending = new Set(current);
  return (
    ids.length === current.length &&
    pending.size === current.length &&
    ids.every((id) => pending.delete(id))
  );
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase('es');
