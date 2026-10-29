import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate, cellText } from '../cells';
import { assertEuro, findHeader, readPreamble, readRows, type TableLayout } from './table';

/**
 * Banco Santander, «Movimientos de la cuenta» (`.xlsx`): la cuenta en el preámbulo y la tabla
 * `Fecha operación | Fecha valor | Concepto | Importe | Divisa | Saldo | Divisa`, con los gastos
 * en negativo. Según la versión, la divisa va en el nombre de la columna (`Importe EUR`).
 */
const LAYOUT = {
  columns: {
    opDate: ['fecha operacion', 'f. operacion', 'fecha de operacion'],
    valueDate: ['fecha valor', 'f. valor'],
    description: ['concepto'],
    amount: ['importe', 'importe eur', 'importe (eur)', 'importe (€)'],
    currency: ['divisa'],
    balance: ['saldo', 'saldo eur', 'saldo (eur)', 'saldo (€)'],
  },
  required: ['opDate', 'description', 'amount'],
} as const satisfies TableLayout<string>;

export const santanderProfile: BankProfile = {
  id: 'santander',
  institution: 'Banco Santander',
  matches: (sheet) => findHeader(sheet, LAYOUT) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet, LAYOUT);
    if (!header) throw new StatementError('formato-desconocido');
    return {
      ...readPreamble(sheet.slice(0, header.row)),
      declaredFrom: null,
      declaredTo: null,
      ...readRows(sheet, header, (cell) => {
        assertEuro(cell('currency'));
        return {
          opDate: cellDate(cell('opDate')),
          valueDate: cellDate(cell('valueDate')),
          description: cellText(cell('description')),
          amountCents: cellCents(cell('amount')),
          balanceAfterCents: cellCents(cell('balance')),
        };
      }),
    };
  },
};
