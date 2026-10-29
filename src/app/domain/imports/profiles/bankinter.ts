import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate, cellText } from '../cells';
import { findHeader, readPreamble, readRows, type TableLayout } from './table';

/**
 * Bankinter, movimientos de la cuenta (`.xls`/`.xlsx`): la cuenta en el preámbulo y la tabla
 * `Fecha contable | Fecha valor | Descripción | Importe | Saldo`, con los gastos en negativo.
 */
const LAYOUT = {
  columns: {
    opDate: ['fecha contable'],
    valueDate: ['fecha valor', 'f. valor'],
    description: ['descripcion', 'concepto'],
    amount: ['importe', 'importe (eur)', 'importe (€)'],
    balance: ['saldo', 'saldo (eur)', 'saldo (€)'],
  },
  required: ['opDate', 'description', 'amount'],
} as const satisfies TableLayout<string>;

export const bankinterProfile: BankProfile = {
  id: 'bankinter',
  institution: 'Bankinter',
  matches: (sheet) => findHeader(sheet, LAYOUT) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet, LAYOUT);
    if (!header) throw new StatementError('formato-desconocido');
    return {
      ...readPreamble(sheet.slice(0, header.row)),
      declaredFrom: null,
      declaredTo: null,
      ...readRows(sheet, header, (cell) => ({
        opDate: cellDate(cell('opDate')),
        valueDate: cellDate(cell('valueDate')),
        description: cellText(cell('description')),
        amountCents: cellCents(cell('amount')),
        balanceAfterCents: cellCents(cell('balance')),
      })),
    };
  },
};
