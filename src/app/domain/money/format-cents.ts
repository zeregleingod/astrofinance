const NBSP = ' ';

/**
 * Formatea céntimos enteros como euros es-ES (`-1.110,70 €`) sin pasar por decimales.
 * Agrupa los miles siempre, como la hoja de cálculo (Intl es-ES no agrupa 4 cifras).
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('El importe debe ser un número entero de céntimos.');
  }
  const abs = Math.abs(cents);
  const euros = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rest = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${euros},${rest}${NBSP}€`;
}
