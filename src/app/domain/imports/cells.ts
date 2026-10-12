import { isoDate } from '../dates/period';
import { numberToCents, parseCents } from '../money/parse-cents';
import type { RawCell } from './bank-statement';

const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const MS_PER_DAY = 86_400_000;
/** Día 0 de los números de serie de Excel (sistema de fechas 1900). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
/** Número de serie del 31/12/9999. */
const MAX_EXCEL_SERIAL = 2_958_465;

/** Texto de una celda, sin espacios sobrantes en los extremos. */
export function cellText(cell: RawCell | undefined): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

/** Texto para comparar cabeceras y etiquetas: minúsculas, sin tildes y con espacios simples. */
export function cellLabel(cell: RawCell | undefined): string {
  return cellText(cell)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Fecha ISO de una celda con `dd/mm/aaaa` o con un número de serie de Excel. */
export function cellDate(cell: RawCell | undefined): string | null {
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || cell < 1 || cell > MAX_EXCEL_SERIAL) return null;
    return new Date(EXCEL_EPOCH + Math.floor(cell) * MS_PER_DAY).toISOString().slice(0, 10);
  }
  return textDate(cellText(cell));
}

/** `dd/mm/aaaa` → `AAAA-MM-DD`. */
export function textDate(text: string): string | null {
  const match = DMY.exec(text);
  return match ? isoDate(Number(match[3]), Number(match[2]), Number(match[1])) : null;
}

/** Céntimos de una celda numérica o con un importe es-ES en texto. */
export function cellCents(cell: RawCell | undefined): number | null {
  return typeof cell === 'number' ? numberToCents(cell) : parseCents(cellText(cell));
}
