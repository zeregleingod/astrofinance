import { formatIsoDate } from '../dates/period';
import { formatCents } from '../money/format-cents';
import type { TransactionRow } from './transaction-row';

/** Columnas por las que se puede ordenar la tabla de movimientos. */
export type TransactionSortKey =
  | 'bookedDate'
  | 'opDate'
  | 'description'
  | 'tags'
  | 'category'
  | 'subcategory'
  | 'account'
  | 'amount'
  | 'notes';

export type SortDirection = 'asc' | 'desc';

export interface TransactionSort {
  readonly key: TransactionSortKey;
  readonly direction: SortDirection;
}

/** Textos visibles que también se buscan (vienen de la capa de textos). */
export interface TableLabels {
  readonly shared: string;
  readonly reimbursement: string;
  readonly transfer: string;
  readonly installment: string;
  readonly uncategorized: string;
}

export function transactionTags(row: TransactionRow, labels: TableLabels): string[] {
  return [
    ...(row.shared ? [labels.shared] : []),
    ...(row.reimbursement ? [labels.reimbursement] : []),
    ...(row.transfer ? [labels.transfer] : []),
    ...(row.installment ? [`${labels.installment} ${row.installment}`] : []),
  ];
}

/** Minúsculas, sin tildes y con los espacios (también los duros) colapsados. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Filtra por cualquier texto visible de la fila; con varias palabras, deben estar todas. */
export function filterTransactions(
  rows: readonly TransactionRow[],
  query: string,
  labels: TableLabels,
): TransactionRow[] {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [...rows];
  return rows.filter((row) => {
    const haystack = normalizeSearch(searchableText(row, labels));
    return terms.every((term) => haystack.includes(term));
  });
}

function searchableText(row: TransactionRow, labels: TableLabels): string {
  return [
    formatIsoDate(row.bookedDate),
    formatIsoDate(row.opDate),
    row.description,
    ...transactionTags(row, labels),
    row.categoryName ?? labels.uncategorized,
    row.subcategoryName ?? '',
    row.accountName,
    formatCents(row.amountCents),
    row.note ?? '',
  ].join(' | ');
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

type SortValue = string | number | null;

/**
 * Ordena sin modificar la lista. Las celdas vacías van siempre al final; los empates se
 * resuelven por id en el mismo sentido (con la fecha descendente, lo más reciente primero).
 */
export function sortTransactions(
  rows: readonly TransactionRow[],
  sort: TransactionSort,
  labels: TableLabels,
): TransactionRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const value = (row: TransactionRow) => sortValue(row, sort.key, labels);
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else {
      const order =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : collator.compare(String(va), String(vb));
      if (order !== 0) return order * sign;
    }
    return (a.id - b.id) * sign;
  });
}

function sortValue(row: TransactionRow, key: TransactionSortKey, labels: TableLabels): SortValue {
  switch (key) {
    case 'bookedDate':
      return row.bookedDate;
    case 'opDate':
      return row.opDate;
    case 'description':
      return row.description;
    case 'tags':
      return transactionTags(row, labels).join(' ') || null;
    case 'category':
      return row.categoryName;
    case 'subcategory':
      return row.subcategoryName;
    case 'account':
      return row.accountName;
    case 'amount':
      return row.amountCents;
    case 'notes':
      return row.note;
  }
}

/** Pulsar una columna nueva ordena ascendente; pulsar la misma alterna el sentido. */
export function nextSort(current: TransactionSort, key: TransactionSortKey): TransactionSort {
  if (current.key !== key) return { key, direction: 'asc' };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}
