import { isPeriod, periodParts } from '../dates/period';
import type { SplitRow, TransactionRow } from './transaction-row';

/** Marcas de un movimiento por las que se puede filtrar. */
export const TRANSACTION_TAGS = [
  'shared',
  'reimbursement',
  'transfer',
  'installment',
  'split',
] as const;

export type TransactionTag = (typeof TRANSACTION_TAGS)[number];

/** Una subcategoría solo se identifica junto a su categoría: los nombres se repiten entre ellas. */
export interface SubcategoryChoice {
  readonly category: string;
  readonly name: string;
}

/**
 * Criterios para acotar la lista de movimientos. Un criterio a `null` no filtra. Las fechas y
 * el año se refieren a la fecha imputada, que es la que se muestra en la columna «Fecha».
 */
export interface TransactionFilter {
  readonly year: number | null;
  /** `AAAA-MM-DD`, ambos incluidos. */
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly tag: TransactionTag | null;
  /** Categoría principal; `{ name: null }` pide los movimientos sin categoría. */
  readonly category: { readonly name: string | null } | null;
  readonly subcategory: SubcategoryChoice | null;
  readonly account: string | null;
  /** Límites sobre el valor absoluto del importe: valen igual para gastos e ingresos. */
  readonly minAmountCents: number | null;
  readonly maxAmountCents: number | null;
}

export const NO_FILTER: TransactionFilter = {
  year: null,
  dateFrom: null,
  dateTo: null,
  tag: null,
  category: null,
  subcategory: null,
  account: null,
  minAmountCents: null,
  maxAmountCents: null,
};

/** Lo que se puede elegir en cada filtro: solo lo que aparece en algún movimiento. */
export interface TransactionFilterOptions {
  /** Del más reciente al más antiguo. */
  readonly years: readonly number[];
  readonly categories: readonly string[];
  /** Hay movimientos sin categoría. */
  readonly uncategorized: boolean;
  readonly subcategories: readonly SubcategoryChoice[];
  readonly accounts: readonly string[];
}

export function isFiltering(filter: TransactionFilter): boolean {
  return Object.values(filter).some((value) => value !== null);
}

/** Los movimientos que cumplen todos los criterios, en el mismo orden. */
export function applyTransactionFilter(
  rows: readonly TransactionRow[],
  filter: TransactionFilter,
): TransactionRow[] {
  if (!isFiltering(filter)) return [...rows];
  const { year, dateFrom, dateTo, tag, category, subcategory, account } = filter;
  const yearPrefix = year === null ? null : `${String(year).padStart(4, '0')}-`;

  return rows.filter((row) => {
    if (yearPrefix !== null && !row.bookedDate.startsWith(yearPrefix)) return false;
    if (dateFrom !== null && row.bookedDate < dateFrom) return false;
    if (dateTo !== null && row.bookedDate > dateTo) return false;
    if (tag !== null && !hasTag(row, tag)) return false;
    // Un movimiento dividido también está en las categorías de sus submovimientos (ADR-0019).
    const placed = [row, ...row.splits];
    if (category !== null && !placed.some((p) => p.categoryName === category.name)) return false;
    if (
      subcategory !== null &&
      !placed.some(
        (p) => p.categoryName === subcategory.category && p.subcategoryName === subcategory.name,
      )
    ) {
      return false;
    }
    if (account !== null && row.accountName !== account) return false;
    const amount = Math.abs(row.amountCents);
    if (filter.minAmountCents !== null && amount < filter.minAmountCents) return false;
    return filter.maxAmountCents === null || amount <= filter.maxAmountCents;
  });
}

export function transactionFilterOptions(
  rows: readonly TransactionRow[],
): TransactionFilterOptions {
  const years = new Set<number>();
  const categories = new Set<string>();
  const accounts = new Set<string>();
  const subcategories = new Map<string, SubcategoryChoice>();
  let uncategorized = false;

  const place = (where: Pick<SplitRow, 'categoryName' | 'subcategoryName'>) => {
    if (where.categoryName === null) {
      uncategorized = true;
      return;
    }
    categories.add(where.categoryName);
    if (where.subcategoryName !== null) {
      subcategories.set(`${where.categoryName}\u0000${where.subcategoryName}`, {
        category: where.categoryName,
        name: where.subcategoryName,
      });
    }
  };

  for (const row of rows) {
    years.add(Number(row.bookedDate.slice(0, 4)));
    accounts.add(row.accountName);
    place(row);
    row.splits.forEach(place);
  }

  return {
    years: [...years].sort((a, b) => b - a),
    categories: [...categories].sort(byName),
    uncategorized,
    subcategories: [...subcategories.values()].sort(
      (a, b) => byName(a.category, b.category) || byName(a.name, b.name),
    ),
    accounts: [...accounts].sort(byName),
  };
}

/** El filtro que deja solo un mes (`AAAA-MM`); sin filtro si el mes no es válido. */
export function monthFilter(period: string | undefined): TransactionFilter {
  if (!isPeriod(period)) return NO_FILTER;
  const { year, month } = periodParts(period);
  // El día 0 del mes siguiente es el último de este.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    ...NO_FILTER,
    dateFrom: `${period}-01`,
    dateTo: `${period}-${String(lastDay).padStart(2, '0')}`,
  };
}

function hasTag(row: TransactionRow, tag: TransactionTag): boolean {
  switch (tag) {
    case 'installment':
      return row.installment !== null;
    case 'split':
      return row.splits.length > 0;
    default:
      return row[tag];
  }
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byName = (a: string, b: string) => collator.compare(a, b);
