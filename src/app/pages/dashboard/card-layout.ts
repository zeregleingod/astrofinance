/** Tarjetas por columna y columnas del bloque de arriba del Resumen. */
const PER_COLUMN = 3;
const COLUMNS = 3;

export interface CardLayout<T> {
  /** Columnas de arriba, de izquierda a derecha; cada una con sus tarjetas de arriba abajo. */
  readonly columns: readonly (readonly T[])[];
  /** Las que no caben en las columnas: van debajo, de tres en tres por fila. */
  readonly rest: readonly T[];
}

/**
 * Reparte las tarjetas en orden por columnas: las tres primeras en la primera, las tres
 * siguientes en la segunda y así hasta tres columnas. Las demás quedan para debajo.
 */
export function cardLayout<T>(cards: readonly T[]): CardLayout<T> {
  const columns: T[][] = [];
  for (let start = 0; start < Math.min(cards.length, PER_COLUMN * COLUMNS); start += PER_COLUMN) {
    columns.push(cards.slice(start, start + PER_COLUMN));
  }
  return { columns, rest: cards.slice(PER_COLUMN * COLUMNS) };
}
