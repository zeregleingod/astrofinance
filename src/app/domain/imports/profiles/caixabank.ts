import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate } from '../cells';
import { findHeader, joinText, readPreamble, readRows, type TableLayout } from './table';

/**
 * CaixaBank, «Movimientos» (`.xls`): la cuenta en el preámbulo y la tabla `Fecha | Fecha valor |
 * Movimiento | Más datos | Importe | Saldo`. El concepto es `Movimiento` seguido de `Más datos`,
 * que suele llevar el comercio o el ordenante. Los importes pueden venir como `-12,34EUR`.
 */
const LAYOUT = {
  columns: {
    opDate: ['fecha', 'fecha operacion'],
    valueDate: ['fecha valor', 'f. valor'],
    kind: ['movimiento', 'concepto'],
    details: ['mas datos'],
    amount: ['importe'],
    balance: ['saldo'],
  },
  required: ['opDate', 'kind', 'details', 'amount'],
} as const satisfies TableLayout<string>;

export const caixabankProfile: BankProfile = {
  id: 'caixabank',
  institution: 'CaixaBank',
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
        description: joinText([cell('kind'), cell('details')]),
        amountCents: cellCents(cell('amount')),
        balanceAfterCents: cellCents(cell('balance')),
      })),
    };
  },
};
