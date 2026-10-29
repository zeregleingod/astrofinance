import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate, cellText } from '../cells';
import { assertEuro, findHeader, readPreamble, readRows, type TableLayout } from './table';

/**
 * BBVA, «Movimientos de la cuenta» (`.xlsx`): unas filas con la cuenta y la tabla `F.Valor |
 * Fecha | Concepto | Movimiento | Importe | Divisa | Disponible | Divisa | Observaciones`, con los
 * gastos en negativo y el disponible tras el movimiento. `Concepto` suele ser el comercio y
 * `Movimiento` el tipo de operación («Pago con tarjeta»).
 */
const LAYOUT = {
  columns: {
    opDate: ['fecha', 'fecha operacion'],
    valueDate: ['f.valor', 'f. valor', 'fecha valor'],
    concept: ['concepto'],
    kind: ['movimiento'],
    amount: ['importe'],
    currency: ['divisa'],
    balance: ['disponible', 'saldo'],
    notes: ['observaciones'],
  },
  required: ['opDate', 'concept', 'kind', 'amount', 'balance'],
} as const satisfies TableLayout<string>;

export const bbvaProfile: BankProfile = {
  id: 'bbva',
  institution: 'BBVA',
  matches: (sheet) => findHeader(sheet, LAYOUT) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet, LAYOUT);
    if (!header) throw new StatementError('formato-desconocido');
    return {
      ...readPreamble(sheet.slice(0, header.row)),
      declaredFrom: null,
      declaredTo: null,
      ...readRows(sheet, header, (cell) => {
        // La primera columna «Divisa» es la del importe.
        assertEuro(cell('currency'));
        return {
          opDate: cellDate(cell('opDate')),
          valueDate: cellDate(cell('valueDate')),
          description: cellText(cell('concept')) || cellText(cell('kind')),
          amountCents: cellCents(cell('amount')),
          balanceAfterCents: cellCents(cell('balance')),
          reference: cellText(cell('notes')),
        };
      }),
    };
  },
};
