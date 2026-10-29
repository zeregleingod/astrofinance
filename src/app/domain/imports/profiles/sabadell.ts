import type { BankProfile } from '../bank-profile';
import { StatementError, type ProfileStatement, type RawSheet } from '../bank-statement';
import { cellCents, cellDate, cellLabel, cellText, textDate } from '../cells';
import { findHeader, joinText, readRows, type TableLayout } from './table';

/**
 * Banc Sabadell, «Consulta de movimientos» (`.xls`): un preámbulo con cuenta, divisa, titular
 * y periodo, y una tabla `F. Operativa | Concepto | F. Valor | Importe | Saldo | Referencia 1 |
 * Referencia 2` en orden descendente, con los gastos en negativo y el saldo tras el movimiento.
 */
const LAYOUT = {
  columns: {
    opDate: ['f. operativa'],
    description: ['concepto'],
    valueDate: ['f. valor'],
    amount: ['importe'],
    balance: ['saldo'],
    reference1: ['referencia 1'],
    reference2: ['referencia 2'],
  },
  required: ['opDate', 'description', 'amount'],
} as const satisfies TableLayout<string>;

const PERIOD = /(\d{1,2}\/\d{1,2}\/\d{4})\D+(\d{1,2}\/\d{1,2}\/\d{4})/;

export const sabadellProfile: BankProfile = {
  id: 'sabadell',
  institution: 'Banc Sabadell',
  matches: (sheet) => findHeader(sheet, LAYOUT) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet, LAYOUT);
    if (!header) throw new StatementError('formato-desconocido');
    return {
      ...readPreamble(sheet.slice(0, header.row)),
      ...readRows(sheet, header, (cell) => ({
        opDate: cellDate(cell('opDate')),
        valueDate: cellDate(cell('valueDate')),
        description: cellText(cell('description')),
        amountCents: cellCents(cell('amount')),
        balanceAfterCents: cellCents(cell('balance')),
        reference: joinText([cell('reference1'), cell('reference2')]),
      })),
    };
  },
};

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
