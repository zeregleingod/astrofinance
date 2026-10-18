import type { CategoryKind } from '../categories/category-kind';

/** Categoría tal y como sale de la consulta, en el orden en que se enseña. */
export interface YearCategory {
  readonly id: number;
  readonly parentId: number | null;
  readonly name: string;
  /** `null` en las categorías principales: el tipo es de las subcategorías. */
  readonly kind: CategoryKind | null;
  readonly color: string | null;
}

/** Total de una categoría (o de lo que no tiene, con `null`) en un mes del año. */
export interface YearTotalRow {
  readonly categoryId: number | null;
  /** 1–12. */
  readonly month: number;
  /** Neto: ya incluye lo devuelto. */
  readonly totalCents: number;
  readonly count: number;
  /** Lo que devuelve la otra persona (reembolsos repartidos aquí); 0 si no llega. */
  readonly reimbursedCents?: number;
}

/** Doce importes, de enero a diciembre, y su suma. */
export interface MonthSeries {
  readonly months: readonly number[];
  readonly totalCents: number;
}

export interface YearLine extends MonthSeries {
  readonly id: number;
  readonly name: string;
  readonly color: string | null;
  readonly count: number;
  /**
   * Lo devuelto por la otra persona, ya incluido en `months` y con el mismo criterio de signo:
   * lo gastado cada mes es `months[i] - reimbursed.months[i]`.
   */
  readonly reimbursed: MonthSeries;
}

/** Un bloque de la hoja anual (Ingresos, Hipoteca…) con sus subcategorías. */
export interface YearGroup extends YearLine {
  /** El tipo común de sus subcategorías; `null` si se mezclan o no tienen. */
  readonly kind: CategoryKind | null;
  readonly lines: readonly YearLine[];
}

export interface YearReport {
  readonly year: number;
  readonly groups: readonly YearGroup[];
  readonly uncategorized: MonthSeries & {
    readonly count: number;
    readonly reimbursed: MonthSeries;
  };
  readonly income: MonthSeries;
  /** Negativo: gasto neto. */
  readonly expense: MonthSeries;
  /** Lo devuelto por la otra persona en los gastos: lo gastado es `expense - reimbursed`. */
  readonly reimbursed: MonthSeries;
  /** Positivo: dinero apartado a ahorro. */
  readonly savings: MonthSeries;
  /** Todo lo imputado a cada mes, tenga tipo o no su categoría (como en el resumen mensual). */
  readonly balance: MonthSeries;
  /** El balance sin el ahorro apartado: lo que queda de ingresos menos gastos. */
  readonly balanceWithoutSavings: MonthSeries;
  /** Qué meses tienen algún movimiento. */
  readonly monthsWithData: readonly boolean[];
}

export interface YearReportInput {
  readonly year: number;
  readonly categories: readonly YearCategory[];
  readonly totals: readonly YearTotalRow[];
}

const MONTHS = 12;

/**
 * Hoja anual: las mismas reglas que `buildMonthReport` aplicadas mes a mes. El ahorro apartado
 * se enseña en positivo; los totales de categorías que no están en la lista no cuentan.
 */
export function buildYearReport(input: YearReportInput): YearReport {
  const ids = new Set(input.categories.map((c) => c.id));
  const raw = new Map<number | null, RawSeries>();
  const monthsWithData = Array.from({ length: MONTHS }, () => false);

  for (const row of input.totals) {
    if (!Number.isInteger(row.month) || row.month < 1 || row.month > MONTHS) {
      throw new RangeError('Mes no válido (1–12).');
    }
    if (row.categoryId !== null && !ids.has(row.categoryId)) continue;
    const entry = raw.get(row.categoryId) ?? emptyRaw();
    entry.months[row.month - 1] = (entry.months[row.month - 1] ?? 0) + row.totalCents;
    entry.reimbursed[row.month - 1] =
      (entry.reimbursed[row.month - 1] ?? 0) + (row.reimbursedCents ?? 0);
    entry.count += row.count;
    raw.set(row.categoryId, entry);
    if (row.count > 0) monthsWithData[row.month - 1] = true;
  }

  const rawOf = (id: number | null) => raw.get(id) ?? emptyRaw();
  const flip = (c: YearCategory, months: readonly number[]) =>
    c.kind === 'ahorro' ? months.map((v) => 0 - v) : months;
  const shownOf = (c: YearCategory) => flip(c, rawOf(c.id).months);
  const reimbursedOf = (c: YearCategory) => flip(c, rawOf(c.id).reimbursed);

  const isGroup = (c: YearCategory) => c.parentId === null || !ids.has(c.parentId);
  const groups = input.categories.filter(isGroup).map((root): YearGroup => {
    const children = input.categories.filter((c) => !isGroup(c) && c.parentId === root.id);
    const members = [...(rawOf(root.id).count > 0 ? [root] : []), ...children];
    const lines = members.map((c): YearLine => {
      const months = shownOf(c);
      return {
        id: c.id,
        name: c.name,
        color: c.color ?? root.color,
        months,
        totalCents: sum(months),
        count: rawOf(c.id).count,
        reimbursed: series(reimbursedOf(c)),
      };
    });
    // El grupo suma también sus movimientos directos aunque no sean una línea.
    const months = addAll([shownOf(root), ...children.map(shownOf)]);
    return {
      id: root.id,
      name: root.name,
      color: root.color,
      months,
      totalCents: sum(months),
      count: sum([root, ...children].map((c) => rawOf(c.id).count)),
      reimbursed: series(addAll([root, ...children].map(reimbursedOf))),
      kind: commonKind([root, ...children]),
      lines,
    };
  });

  const ofKind = (kind: CategoryKind) => input.categories.filter((c) => c.kind === kind);
  const byKind = (kind: CategoryKind) => addAll(ofKind(kind).map((c) => rawOf(c.id).months));
  const savings = byKind('ahorro').map((v) => 0 - v);
  const uncategorized = rawOf(null);
  const balance = addAll([...raw.values()].map((e) => e.months));

  return {
    year: input.year,
    groups,
    uncategorized: {
      ...series(uncategorized.months),
      count: uncategorized.count,
      reimbursed: series(uncategorized.reimbursed),
    },
    income: series(byKind('ingreso')),
    expense: series(byKind('gasto')),
    reimbursed: series(addAll(ofKind('gasto').map((c) => rawOf(c.id).reimbursed))),
    savings: series(savings),
    balance: series(balance),
    balanceWithoutSavings: series(addAll([balance, savings])),
    monthsWithData,
  };
}

function commonKind(categories: readonly YearCategory[]): CategoryKind | null {
  const kinds = new Set(categories.flatMap((c) => (c.kind === null ? [] : [c.kind])));
  const [only] = kinds;
  return kinds.size === 1 && only !== undefined ? only : null;
}

interface RawSeries {
  readonly months: number[];
  readonly reimbursed: number[];
  count: number;
}

function emptyRaw(): RawSeries {
  return { months: zeros(), reimbursed: zeros(), count: 0 };
}

function series(months: readonly number[]): MonthSeries {
  return { months, totalCents: sum(months) };
}

function addAll(rows: readonly (readonly number[])[]): number[] {
  return zeros().map((zero, i) => rows.reduce((acc, row) => acc + (row[i] ?? 0), zero));
}

function zeros(): number[] {
  return Array.from({ length: MONTHS }, () => 0);
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
