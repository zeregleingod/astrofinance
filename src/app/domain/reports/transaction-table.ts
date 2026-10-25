import { formatIsoDate } from '../dates/period';
import { formatCents } from '../money/format-cents';
import type { TransactionLinkKind, TransactionRow } from './transaction-row';

/** Columnas por las que se puede ordenar la tabla de movimientos. */
export type TransactionSortKey =
  'bookedDate' | 'description' | 'tags' | 'category' | 'account' | 'amount' | 'notes';

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
  readonly split: string;
  readonly uncategorized: string;
}

export function transactionTags(row: TransactionRow, labels: TableLabels): string[] {
  return [
    ...(row.shared ? [labels.shared] : []),
    ...(row.reimbursement ? [labels.reimbursement] : []),
    ...(row.transfer ? [labels.transfer] : []),
    ...(row.installment ? [`${labels.installment} ${row.installment}`] : []),
    ...(row.splits.length > 0 ? [labels.split] : []),
  ];
}

/** Cómo se presenta cada tipo de vínculo (vienen de la capa de textos). */
export type LinkLabels = Readonly<Record<TransactionLinkKind, string>>;

/**
 * Un texto por movimiento vinculado (ADR-0022): «Devuelto por: BIZUM ANA, 11/09/2026, 30,00 €»;
 * en un traspaso, con la cuenta de la otra pata delante.
 */
export function linkDescriptions(row: TransactionRow, labels: LinkLabels): string[] {
  return row.links.map((link) =>
    [
      `${labels[link.kind]}: ${link.kind === 'transfer' ? `${link.accountName}, ` : ''}${link.description}`,
      formatIsoDate(link.date),
      formatCents(Math.abs(link.amountCents)),
    ].join(', '),
  );
}

/** El movimiento y los vinculados con él, sin repetir: los que enseña la vista de vínculos. */
export function linkedIds(row: TransactionRow): ReadonlySet<number> {
  return new Set([row.id, ...row.links.map((link) => link.transactionId)]);
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
    ...row.splits.flatMap((split) => [
      split.description,
      split.categoryName ?? labels.uncategorized,
      split.subcategoryName ?? '',
      formatCents(split.amountCents),
    ]),
    ...row.refunds.map((refund) => refund.description),
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
    case 'description':
      return row.description;
    case 'tags':
      return transactionTags(row, labels).join(' ') || null;
    // «Principal › Subcategoría», como se ve: por categoría y, dentro, por subcategoría.
    case 'category':
      return row.categoryName === null
        ? null
        : [row.categoryName, row.subcategoryName].filter(Boolean).join(' › ');
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
