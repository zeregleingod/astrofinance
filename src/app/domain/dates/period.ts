/** Mes contable `AAAA-MM`; un movimiento se imputa a uno (ADR-0005). */
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isPeriod(value: unknown): value is string {
  return typeof value === 'string' && PERIOD.test(value);
}

export function periodParts(period: string): { year: number; month: number } {
  const match = PERIOD.exec(period);
  if (!match) throw new RangeError('Periodo no válido (AAAA-MM).');
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function shiftPeriod(period: string, months: number): string {
  const { year, month } = periodParts(period);
  const index = year * 12 + (month - 1) + months;
  const newYear = Math.floor(index / 12);
  const newMonth = index - newYear * 12 + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

/** El periodo pedido si hay datos de él; si no, el más reciente disponible. */
export function resolvePeriod(
  requested: string | undefined,
  available: readonly string[],
): string | undefined {
  if (requested !== undefined && available.includes(requested)) return requested;
  return available.at(-1);
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
export function formatIsoDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError('Fecha no válida (AAAA-MM-DD).');
  return `${match[3]}/${match[2]}/${match[1]}`;
}
