import type { CategoryKind } from '../categories/category-kind';

/** Total de una categoría en un periodo, tal y como sale de la consulta (orden incluido). */
export interface CategoryTotalRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly name: string;
  /** `null` en las categorías principales: el tipo es de las subcategorías. */
  readonly kind: CategoryKind | null;
  readonly color: string | null;
  readonly totalCents: number;
  readonly count: number;
}

export interface CategoryLine {
  readonly id: number;
  readonly name: string;
  readonly color: string | null;
  /** Como se enseña: con su signo, salvo el ahorro, que va en positivo cuando se aparta dinero. */
  readonly totalCents: number;
  readonly count: number;
}

/** Un bloque de la hoja mensual (Ingresos, Hipoteca…) con sus subcategorías. */
export interface CategoryGroup extends CategoryLine {
  readonly lines: readonly CategoryLine[];
}

export interface Totals {
  readonly totalCents: number;
  readonly count: number;
}

export interface MonthReport {
  readonly period: string;
  readonly incomeCents: number;
  /** Negativo: gasto neto (las devoluciones y reembolsos ya restan). */
  readonly expenseCents: number;
  /** Positivo: dinero apartado a ahorro en el mes (aportaciones menos retiradas). */
  readonly savingsCents: number;
  readonly balanceCents: number;
  readonly pendingReimbursementCents: number;
  readonly uncategorized: Totals;
  readonly groups: readonly CategoryGroup[];
}

export interface MonthReportInput {
  readonly period: string;
  readonly categories: readonly CategoryTotalRow[];
  readonly uncategorized: Totals;
  readonly pendingReimbursementCents: number;
}

export function buildMonthReport(input: MonthReportInput): MonthReport {
  const ids = new Set(input.categories.map((c) => c.id));
  const isGroup = (c: CategoryTotalRow) => c.parentId === null || !ids.has(c.parentId);

  const groups = input.categories.filter(isGroup).map((root): CategoryGroup => {
    const color = root.color;
    const children = input.categories.filter((c) => !isGroup(c) && c.parentId === root.id);
    const lines = [...(root.count > 0 ? [root] : []), ...children].map((c): CategoryLine => ({
      id: c.id,
      name: c.name,
      color: c.color ?? color,
      totalCents: shown(c),
      count: c.count,
    }));
    return {
      id: root.id,
      name: root.name,
      color,
      totalCents: sum([root, ...children].map(shown)),
      count: sum([root, ...children].map((c) => c.count)),
      lines,
    };
  });

  const byKind = (kind: CategoryKind) =>
    sum(input.categories.filter((c) => c.kind === kind).map((c) => c.totalCents));
  const incomeCents = byKind('ingreso');
  const expenseCents = byKind('gasto');
  // Apartar dinero es una salida de la cuenta (negativa): como ahorro se enseña en positivo.
  const savingsCents = 0 - byKind('ahorro');

  return {
    period: input.period,
    incomeCents,
    expenseCents,
    savingsCents,
    // Todo lo del mes, tenga tipo o no su categoría.
    balanceCents: sum(input.categories.map((c) => c.totalCents)) + input.uncategorized.totalCents,
    pendingReimbursementCents: input.pendingReimbursementCents,
    uncategorized: input.uncategorized,
    groups,
  };
}

/**
 * Apartar dinero es una salida de la cuenta (negativa), pero para el usuario es ahorro que
 * suma: en el resumen el importe de las categorías de ahorro cambia de signo.
 */
function shown(category: CategoryTotalRow): number {
  return category.kind === 'ahorro' ? 0 - category.totalCents : category.totalCents;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
