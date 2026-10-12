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

/** Categoría tal como se guarda: las principales no tienen `parentId` ni tipo (ADR-0009). */
export interface CategoryRecord {
  readonly id: number;
  readonly parentId: number | null;
  readonly name: string;
  readonly kind: CategoryKind | null;
  readonly color: string | null;
  /** Movimientos que la tienen asignada directamente. */
  readonly transactionCount: number;
}

/** A lo que se asignan los movimientos; su tipo decide si cuentan como ingreso o gasto. */
export interface Subcategory {
  readonly id: number;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly transactionCount: number;
}

/** Categoría principal: agrupa subcategorías y les da color. */
export interface CategoryGroup {
  readonly id: number;
  readonly name: string;
  readonly color: string | null;
  /** Movimientos asignados a la principal, sin contar los de sus subcategorías. */
  readonly transactionCount: number;
  readonly subcategories: readonly Subcategory[];
}

/** Alta de una categoría principal (con color) o de una subcategoría (con tipo). */
export type NewCategory =
  | { readonly parentId: null; readonly name: string; readonly color: string | null }
  | { readonly parentId: number; readonly name: string; readonly kind: CategoryKind };

/** Cambios en una categoría principal (nombre y color) o en una subcategoría (nombre y tipo). */
export type CategoryUpdate =
  | { readonly id: number; readonly name: string; readonly color: string | null }
  | { readonly id: number; readonly name: string; readonly kind: CategoryKind };

const NAME_ERROR_CODES = ['nombre-vacio', 'nombre-largo', 'nombre-repetido'] as const;

export const CATEGORY_ERROR_CODES = [
  ...NAME_ERROR_CODES,
  'principal-inexistente',
  'categoria-inexistente',
] as const;

export type CategoryNameErrorCode = (typeof NAME_ERROR_CODES)[number];
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
      color: group.color,
      transactionCount: group.transactionCount,
      subcategories: records
        .filter((record) => record.parentId === group.id)
        .map(({ id, name, kind, transactionCount }) => ({
          id,
          name,
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

const nameKey = (name: string) => name.trim().toLocaleLowerCase('es');
