import type { BankProfile } from '../bank-profile';
import {
  StatementError,
  type ProfileStatement,
  type RawCell,
  type RawSheet,
  type StatementMovement,
  type StatementRowError,
} from '../bank-statement';
import { cellCents, cellDate, cellLabel, cellText, textDate } from '../cells';

/**
 * Banc Sabadell, «Consulta de movimientos» (`.xls`): un preámbulo con cuenta, divisa, titular
 * y periodo, y una tabla `F. Operativa | Concepto | F. Valor | Importe | Saldo | Referencia 1 |
 * Referencia 2` en orden descendente, con los gastos en negativo y el saldo tras el movimiento.
 */
const COLUMNS = {
  opDate: 'f. operativa',
  description: 'concepto',
  valueDate: 'f. valor',
  amount: 'importe',
  balance: 'saldo',
  reference1: 'referencia 1',
  reference2: 'referencia 2',
} as const;

type Column = keyof typeof COLUMNS;
type ColumnIndex = Readonly<Record<Column, number>>;
interface Header {
  readonly row: number;
  readonly columns: ColumnIndex;
}

const REQUIRED: readonly Column[] = ['opDate', 'description', 'amount'];
/** La cabecera se busca por nombre, no por posición, pero solo al principio de la hoja. */
const HEADER_SEARCH_ROWS = 40;
const MAX_DESCRIPTION = 500;
const MAX_REFERENCE = 100;
const PERIOD = /(\d{1,2}\/\d{1,2}\/\d{4})\D+(\d{1,2}\/\d{1,2}\/\d{4})/;

export const sabadellProfile: BankProfile = {
  id: 'sabadell',
  institution: 'Banc Sabadell',
  matches: (sheet) => findHeader(sheet) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet);
    if (!header) throw new StatementError('formato-desconocido');
    return { ...readPreamble(sheet.slice(0, header.row)), ...readRows(sheet, header) };
  },
};

function findHeader(sheet: RawSheet): Header | undefined {
  for (const [row, cells] of sheet.slice(0, HEADER_SEARCH_ROWS).entries()) {
    const labels = cells.map(cellLabel);
    const columns = Object.fromEntries(
      Object.entries(COLUMNS).map(([column, label]) => [column, labels.indexOf(label)]),
    ) as Record<Column, number>;
    if (REQUIRED.every((column) => columns[column] >= 0)) return { row, columns };
  }
  return undefined;
}

function readPreamble(
  rows: RawSheet,
): Pick<ProfileStatement, 'ibanLast4' | 'declaredFrom' | 'declaredTo'> {
  let ibanLast4: string | null = null;
  let declaredFrom: string | null = null;
  let declaredTo: string | null = null;

  for (const cells of rows) {
    const label = cellLabel(cells[0]);
    const value = cells.slice(1).map(cellText).find(Boolean) ?? '';
    if (label.startsWith('cuenta')) {
      // Del IBAN solo salen de aquí los cuatro últimos dígitos.
      ibanLast4 = /\d{4}$/.exec(value.replace(/\s/g, ''))?.[0] ?? null;
    } else if (label.startsWith('divisa') && value.toUpperCase() !== 'EUR') {
      throw new StatementError('divisa-no-admitida');
    } else if (label.startsWith('seleccion')) {
      const [, from = '', to = ''] = PERIOD.exec(value) ?? [];
      declaredFrom = textDate(from);
      declaredTo = textDate(to);
    }
  }
  return { ibanLast4, declaredFrom, declaredTo };
}

function readRows(sheet: RawSheet, header: Header): Pick<ProfileStatement, 'movements' | 'errors'> {
  const movements: StatementMovement[] = [];
  const errors: StatementRowError[] = [];

  for (const [offset, cells] of sheet.slice(header.row + 1).entries()) {
    if (cells.every((cell) => cellText(cell) === '')) continue;
    const row = header.row + offset + 2;
    const cell = (column: Column): RawCell | undefined => cells[header.columns[column]];

    const opDate = cellDate(cell('opDate'));
    const description = cellText(cell('description'));
    const amountCents = cellCents(cell('amount'));
    if (opDate === null) {
      errors.push({ row, field: 'fecha' });
    } else if (description === '' || description.length > MAX_DESCRIPTION) {
      errors.push({ row, field: 'concepto' });
    } else if (amountCents === null || amountCents === 0) {
      errors.push({ row, field: 'importe' });
    } else {
      const reference = [cellText(cell('reference1')), cellText(cell('reference2'))]
        .filter(Boolean)
        .join(' ')
        .slice(0, MAX_REFERENCE);
      movements.push({
        row,
        opDate,
        valueDate: cellDate(cell('valueDate')),
        description,
        amountCents,
        balanceAfterCents: cellCents(cell('balance')),
        reference: reference || null,
      });
    }
  }
  return { movements, errors };
}
