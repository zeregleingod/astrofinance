import type { CategoryKind } from '../categories/category-kind';

/** Total de una categoría en un periodo, tal y como sale de la consulta (orden incluido). */
export interface CategoryTotalRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly name: string;
  /** `null` en las categorías principales: el tipo es de las subcategorías. */
  readonly kind: CategoryKind | null;
  readonly color: string | null;
  /** Neto: ya incluye lo devuelto. */
  readonly totalCents: number;
  readonly count: number;
  /** Lo que devuelve la otra persona (reembolsos repartidos aquí); 0 si no llega. */
  readonly reimbursedCents?: number;
}

/**
 * Un movimiento tal y como cuenta en el mes (ADR-0013): un movimiento normal, o la parte de un
 * reembolso que se ha repartido a esta categoría.
 */
export interface MonthMovementRow {
  /** Única en el mes: distingue las partes de un mismo reembolso. */
  readonly key: string;
  readonly transactionId: number;
  readonly categoryId: number | null;
  /** Fecha imputada, `AAAA-MM-DD`. */
  readonly date: string;
  readonly description: string;
  /** Lo que cuenta aquí: de un reembolso repartido, solo su parte. */
  readonly amountCents: number;
  /** Parte de un reembolso de la otra persona. */
  readonly reimbursed: boolean;
  /** Si es la parte enlazada a un gasto, el movimiento de ese gasto. */
  readonly expenseId: number | null;
}

/** Fila de una línea del resumen: fecha, concepto e importe. */
export interface Movement {
  readonly key: string;
  readonly date: string;
  readonly description: string;
  /** Con el mismo criterio de signo que el total de su línea. */
  readonly amountCents: number;
  readonly reimbursed: boolean;
}

export interface CategoryLine {
  readonly id: number;
  readonly name: string;
  readonly color: string | null;
  /** Como se enseña: con su signo, salvo el ahorro, que va en positivo cuando se aparta dinero. */
  readonly totalCents: number;
  readonly count: number;
  /**
   * Lo devuelto por la otra persona, ya incluido en `totalCents` y con el mismo criterio de
   * signo: lo gastado es `totalCents - reimbursedCents`.
   */
  readonly reimbursedCents: number;
  /** Por fecha, con cada reembolso justo debajo del gasto que devuelve. */
  readonly movements: readonly Movement[];
}

/** Un bloque de la hoja mensual (Ingresos, Hipoteca…) con sus subcategorías. */
// Los movimientos directos del bloque ya van en su propia línea.
export interface CategoryGroup extends Omit<CategoryLine, 'movements'> {
  readonly lines: readonly CategoryLine[];
}

export interface Totals {
  readonly totalCents: number;
  readonly count: number;
  /** Lo devuelto, ya incluido en `totalCents`. */
  readonly reimbursedCents: number;
}

export interface MonthReport {
  readonly period: string;
  readonly incomeCents: number;
  /** Negativo: gasto neto (las devoluciones y reembolsos ya restan). */
  readonly expenseCents: number;
  /** Lo devuelto por la otra persona en los gastos: lo gastado es `expenseCents - reimbursedCents`. */
  readonly reimbursedCents: number;
  /** Positivo: dinero apartado a ahorro en el mes (aportaciones menos retiradas). */
  readonly savingsCents: number;
  readonly balanceCents: number;
  readonly pendingReimbursementCents: number;
  readonly uncategorized: Totals & { readonly movements: readonly Movement[] };
  readonly groups: readonly CategoryGroup[];
}

export interface MonthReportInput {
  readonly period: string;
  readonly categories: readonly CategoryTotalRow[];
  readonly uncategorized: Omit<Totals, 'reimbursedCents'> & { readonly reimbursedCents?: number };
  readonly pendingReimbursementCents: number;
  readonly movements?: readonly MonthMovementRow[];
}

export function buildMonthReport(input: MonthReportInput): MonthReport {
  const ids = new Set(input.categories.map((c) => c.id));
  const movementsOf = (categoryId: number | null, ahorro: boolean) =>
    ordered((input.movements ?? []).filter((m) => m.categoryId === categoryId)).map(
      (m): Movement => ({
        key: m.key,
        date: m.date,
        description: m.description,
        amountCents: ahorro ? 0 - m.amountCents : m.amountCents,
        reimbursed: m.reimbursed,
      }),
    );
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
      reimbursedCents: shownReimbursed(c),
      movements: movementsOf(c.id, c.kind === 'ahorro'),
    }));
    return {
      id: root.id,
      name: root.name,
      color,
      totalCents: sum([root, ...children].map(shown)),
      count: sum([root, ...children].map((c) => c.count)),
      reimbursedCents: sum([root, ...children].map(shownReimbursed)),
      lines,
    };
  });

  const ofKind = (kind: CategoryKind) => input.categories.filter((c) => c.kind === kind);
  const byKind = (kind: CategoryKind) => sum(ofKind(kind).map((c) => c.totalCents));
  const incomeCents = byKind('ingreso');
  const expenseCents = byKind('gasto');
  // Apartar dinero es una salida de la cuenta (negativa): como ahorro se enseña en positivo.
  const savingsCents = 0 - byKind('ahorro');

  return {
    period: input.period,
    incomeCents,
    expenseCents,
    reimbursedCents: sum(ofKind('gasto').map(reimbursedOf)),
    savingsCents,
    // Todo lo del mes, tenga tipo o no su categoría.
    balanceCents: sum(input.categories.map((c) => c.totalCents)) + input.uncategorized.totalCents,
    pendingReimbursementCents: input.pendingReimbursementCents,
    uncategorized: {
      ...input.uncategorized,
      reimbursedCents: reimbursedOf(input.uncategorized),
      movements: movementsOf(null, false),
    },
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

/**
 * Por fecha (y orden de alta), como en la hoja; la parte de un reembolso enlazada a un gasto de
 * la misma línea va justo debajo de él aunque llegue otro día.
 */
function ordered(rows: readonly MonthMovementRow[]): MonthMovementRow[] {
  const byDate = [...rows].sort(
    (a, b) => a.date.localeCompare(b.date) || a.transactionId - b.transactionId,
  );
  const ids = new Set(rows.filter((r) => r.expenseId === null).map((r) => r.transactionId));
  const follows = (r: MonthMovementRow) => r.expenseId !== null && ids.has(r.expenseId);
  return byDate
    .filter((r) => !follows(r))
    .flatMap((r) => [r, ...byDate.filter((p) => follows(p) && p.expenseId === r.transactionId)]);
}

function shownReimbursed(category: CategoryTotalRow): number {
  const reimbursed = reimbursedOf(category);
  return category.kind === 'ahorro' ? 0 - reimbursed : reimbursed;
}

function reimbursedOf(totals: { readonly reimbursedCents?: number }): number {
  return totals.reimbursedCents ?? 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
