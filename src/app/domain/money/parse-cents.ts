/** Separador decimal de un importe en texto: `,` en es-ES, `.` en los CSV en inglés (N26, Revolut). */
export type DecimalMark = ',' | '.';

const AMOUNT: Readonly<Record<DecimalMark, RegExp>> = {
  ',': /^([+-])?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/,
  '.': /^([+-])?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2})0*)?$/,
};

/**
 * Lee un importe es-ES (`1.234,56`, `-12,3`, `65,47 €`, `-8,00EUR`) como céntimos enteros, sin
 * pasar por decimales. Con `decimal = '.'` lee el formato inglés (`-1,234.56`, `12.50`).
 * Devuelve `null` si el texto no es un importe.
 */
export function parseCents(text: string, decimal: DecimalMark = ','): number | null {
  const match = AMOUNT[decimal].exec(text.replace(/\s|€|EUR/gi, '').replace('−', '-'));
  if (!match) return null;
  const [, sign, units = '', decimals = ''] = match;
  const group = decimal === ',' ? '.' : ',';
  const cents = Number(units.replaceAll(group, '')) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return sign === '-' ? -cents : cents;
}

/** Céntimos de un importe numérico leído de una hoja de cálculo (p. ej. `-69.09`). */
export function numberToCents(value: number): number | null {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 1e-6) return null;
  return cents;
}

/** Céntimos como texto editable: `-1234,56` (sin separador de miles ni símbolo). */
export function centsToInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('El importe debe ser un número entero de céntimos.');
  }
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
