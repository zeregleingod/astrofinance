import {
  StatementError,
  type ProfileStatement,
  type RawCell,
  type RawSheet,
  type StatementMovement,
  type StatementRowError,
} from '../bank-statement';
import { cellLabel, cellText } from '../cells';

/**
 * Piezas comunes a los perfiles cuyo extracto es una tabla con cabecera: casi todos. Cada perfil
 * declara sus columnas y cómo convertir una fila; aquí se localiza la cabecera y se valida.
 */

/** Nombres con que puede aparecer cada columna, ya en forma `cellLabel`. */
export type TableColumns<C extends string> = Readonly<Record<C, readonly string[]>>;

export interface TableLayout<C extends string> {
  readonly columns: TableColumns<C>;
  /** Columnas sin las que la hoja no es de este banco: son su firma, que no debe compartir. */
  readonly required: readonly NoInfer<C>[];
}

export interface TableHeader<C extends string> {
  readonly row: number;
  /** Posición de cada columna en la fila; `-1` si no está. */
  readonly columns: Readonly<Record<C, number>>;
}

/** Lo que un perfil lee de una fila. Un `null` en fecha o importe marca la fila como errónea. */
export interface RowFields {
  readonly opDate: string | null;
  readonly valueDate?: string | null;
  readonly description: string;
  readonly amountCents: number | null;
  readonly balanceAfterCents?: number | null;
  readonly reference?: string;
}

/** Una fila que no es un movimiento (p. ej. una operación pendiente o rechazada). */
export const SKIP_ROW = 'omitir';

/** La cabecera se busca por nombre, no por posición, pero solo al principio de la hoja. */
const HEADER_SEARCH_ROWS = 40;
const MAX_DESCRIPTION = 500;
const MAX_REFERENCE = 100;

export function findHeader<C extends string>(
  sheet: RawSheet,
  layout: TableLayout<C>,
): TableHeader<C> | undefined {
  for (const [row, cells] of sheet.slice(0, HEADER_SEARCH_ROWS).entries()) {
    const labels = cells.map(cellLabel);
    const columns = Object.fromEntries(
      Object.entries<readonly string[]>(layout.columns).map(([column, names]) => [
        column,
        labels.findIndex((label) => names.includes(label)),
      ]),
    ) as Record<C, number>;
    if (layout.required.every((column) => columns[column] >= 0)) return { row, columns };
  }
  return undefined;
}

/** Recorre las filas tras la cabecera: las vacías se saltan y las ilegibles dan un error. */
export function readRows<C extends string>(
  sheet: RawSheet,
  header: TableHeader<C>,
  read: (cell: (column: C) => RawCell | undefined) => RowFields | typeof SKIP_ROW,
): Pick<ProfileStatement, 'movements' | 'errors'> {
  const movements: StatementMovement[] = [];
  const errors: StatementRowError[] = [];

  for (const [offset, cells] of sheet.slice(header.row + 1).entries()) {
    if (cells.every((cell) => cellText(cell) === '')) continue;
    const row = header.row + offset + 2;
    const fields = read((column) => cells[header.columns[column]]);
    if (fields === SKIP_ROW) continue;

    const { opDate, description, amountCents } = fields;
    if (opDate === null) {
      errors.push({ row, field: 'fecha' });
    } else if (description === '' || description.length > MAX_DESCRIPTION) {
      errors.push({ row, field: 'concepto' });
    } else if (amountCents === null || amountCents === 0) {
      errors.push({ row, field: 'importe' });
    } else {
      movements.push({
        row,
        opDate,
        valueDate: fields.valueDate ?? null,
        description,
        amountCents,
        balanceAfterCents: fields.balanceAfterCents ?? null,
        reference: fields.reference?.slice(0, MAX_REFERENCE) || null,
      });
    }
  }
  return { movements, errors };
}

/** Une los textos no vacíos de varias celdas. */
export function joinText(cells: readonly (RawCell | undefined)[], separator = ' '): string {
  return cells.map(cellText).filter(Boolean).join(separator);
}

const EURO = new Set(['', 'eur', '€', 'euro', 'euros']);

/** Rechaza el extracto si una celda de divisa indica una moneda distinta del euro. */
export function assertEuro(cell: RawCell | undefined): void {
  if (!EURO.has(cellLabel(cell))) throw new StatementError('divisa-no-admitida');
}

const ACCOUNT_LABEL = /cuenta|iban|account/;
/** IBAN, CCC o número enmascarado; del que sea solo se conservan los 4 últimos dígitos. */
const ACCOUNT_NUMBER = /[\d*]{6,}(\d{4})/;
const CURRENCY_LABEL = /^(divisa|moneda)\b/;

/**
 * Preámbulo genérico: los 4 últimos dígitos de la cuenta, de la fila que la nombra, y la divisa
 * si se declara. El titular y el IBAN completo no salen de aquí.
 */
export function readPreamble(rows: RawSheet): Pick<ProfileStatement, 'ibanLast4'> {
  let ibanLast4: string | null = null;
  for (const cells of rows) {
    const start = cells.findIndex((cell) => ACCOUNT_LABEL.test(cellLabel(cell)));
    if (ibanLast4 === null && start >= 0) {
      // `|` entre celdas: los dígitos de dos celdas vecinas no se juntan en un número.
      const text = cells.slice(start).map(cellText).join('|').replace(/[\s-]/g, '');
      ibanLast4 = ACCOUNT_NUMBER.exec(text)?.[1] ?? null;
    }
    const currency = cells.findIndex((cell) => CURRENCY_LABEL.test(cellLabel(cell)));
    if (currency >= 0) assertEuro(cells.slice(currency + 1).find((cell) => cellText(cell) !== ''));
  }
  return { ibanLast4 };
}
