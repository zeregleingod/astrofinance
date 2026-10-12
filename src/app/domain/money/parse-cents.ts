const AMOUNT = /^([+-])?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Lee un importe es-ES (`1.234,56`, `-12,3`, `65,47 €`) como céntimos enteros, sin pasar por
 * decimales. Devuelve `null` si el texto no es un importe.
 */
export function parseCents(text: string): number | null {
  const match = AMOUNT.exec(text.replace(/[\s€]/g, '').replace('−', '-'));
  if (!match) return null;
  const [, sign, euros = '', decimals = ''] = match;
  const cents = Number(euros.replaceAll('.', '')) * 100 + Number(decimals.padEnd(2, '0'));
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
