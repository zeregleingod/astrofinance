import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate, cellText } from '../cells';
import { findHeader, readPreamble, readRows, type TableLayout } from './table';

/**
 * ING España, «Movimientos» (`.xls`): número de cuenta, titular y fecha de exportación, y la tabla
 * `F. Valor | Categoría | Subcategoría | Descripción | Comentario | Imagen | Importe (€) |
 * Saldo (€)`. Solo trae una fecha, que se toma como fecha de operación. La categoría de ING no se
 * usa: la clasificación es la de la aplicación.
 */
const LAYOUT = {
  columns: {
    opDate: ['f. valor', 'fecha valor', 'fecha'],
    subcategory: ['subcategoria'],
    description: ['descripcion'],
    comment: ['comentario'],
    amount: ['importe (€)', 'importe (eur)', 'importe'],
    balance: ['saldo (€)', 'saldo (eur)', 'saldo'],
  },
  required: ['opDate', 'subcategory', 'description', 'amount'],
} as const satisfies TableLayout<string>;

export const ingProfile: BankProfile = {
  id: 'ing',
  institution: 'ING',
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
        description: cellText(cell('description')),
        amountCents: cellCents(cell('amount')),
        balanceAfterCents: cellCents(cell('balance')),
        reference: cellText(cell('comment')),
      })),
    };
  },
};
