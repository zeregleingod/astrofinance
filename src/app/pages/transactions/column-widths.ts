import type { TransactionSortKey } from '@domain/reports/transaction-table';

/**
 * Anchos de las columnas de la tabla de Movimientos que ha fijado el usuario (ADR-0036), en px.
 * Una columna sin ancho usa el de siempre (`transactions-page.scss`).
 */
export type ColumnWidths = Readonly<Partial<Record<TransactionSortKey, number>>>;

/** Anchos medidos en pantalla, en px, de todas las columnas. */
export type MeasuredWidths = Readonly<Partial<Record<TransactionSortKey, number>>>;

/**
 * La descripción no tiene ancho propio: se queda con lo que dejan las demás, así que la tabla
 * siempre ocupa justo su caja. Nunca baja de `FLEX_MIN`.
 */
export const FLEX_COLUMN: TransactionSortKey = 'description';
export const FLEX_MIN = 160;

/** Lo mínimo de cada columna: la fecha (con su icono) y el importe no se recortan. */
const MIN: Readonly<Partial<Record<TransactionSortKey, number>>> = {
  bookedDate: 112,
  amount: 96,
};
const DEFAULT_MIN = 64;
/** Más que esto no tiene sentido en ninguna pantalla: protege de lo que venga guardado. */
const MAX = 2000;

const KEYS: readonly TransactionSortKey[] = [
  'bookedDate',
  'description',
  'tags',
  'category',
  'account',
  'amount',
  'notes',
];

export function minWidth(key: TransactionSortKey): number {
  return key === FLEX_COLUMN ? FLEX_MIN : (MIN[key] ?? DEFAULT_MIN);
}

/**
 * Mueve `dx` px el borde entre dos columnas contiguas, `left` y `right`, a partir de sus anchos
 * medidos al empezar (`start`): lo que gana una lo pierde la otra, así que las demás no se mueven.
 * Ninguna baja de su mínimo. Devuelve los anchos que quedan fijados; la descripción no se fija,
 * crece o mengua sola.
 */
export function moveBorder(
  start: MeasuredWidths,
  left: TransactionSortKey,
  right: TransactionSortKey,
  dx: number,
): ColumnWidths {
  // Sin medida (la tabla aún no se ha pintado) cuenta como su mínimo: el borde no se mueve.
  const leftWidth = Math.max(start[left] ?? 0, minWidth(left));
  const rightWidth = Math.max(start[right] ?? 0, minWidth(right));
  const lowest = minWidth(left) - leftWidth;
  const highest = Math.max(lowest, rightWidth - minWidth(right));
  const delta = Math.round(Math.min(Math.max(dx, lowest), highest));
  const widths: Partial<Record<TransactionSortKey, number>> = {};
  if (left !== FLEX_COLUMN) widths[left] = Math.round(leftWidth + delta);
  if (right !== FLEX_COLUMN) widths[right] = Math.round(rightWidth - delta);
  return widths;
}

/** Los anchos guardados, si tienen buena forma; lo que no, se descarta. */
export function parseWidths(value: unknown): ColumnWidths {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const widths: Partial<Record<TransactionSortKey, number>> = {};
  for (const key of KEYS) {
    const width: unknown = (value as Record<string, unknown>)[key];
    if (
      key !== FLEX_COLUMN &&
      typeof width === 'number' &&
      Number.isFinite(width) &&
      width >= minWidth(key) &&
      width <= MAX
    ) {
      widths[key] = Math.round(width);
    }
  }
  return widths;
}
