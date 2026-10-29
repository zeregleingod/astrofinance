import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate, cellText } from '../cells';
import { findHeader, joinText, readRows, type TableLayout } from './table';

/**
 * N26, exportación CSV (en inglés, con fechas `aaaa-mm-dd` y punto decimal). Hay dos versiones:
 * `Date | Payee | Account number | Transaction type | Payment reference | Amount (EUR) | …` y,
 * desde 2024, `Booking Date | Value Date | Partner Name | Partner Iban | Type | Payment Reference |
 * Account Name | Amount (EUR) | …`. No trae saldo ni la cuenta propia; el IBAN de la otra parte
 * no se lee.
 */
const LAYOUT = {
  columns: {
    opDate: ['booking date', 'date'],
    valueDate: ['value date'],
    partner: ['partner name', 'payee'],
    kind: ['type', 'transaction type'],
    reference: ['payment reference'],
    amount: ['amount (eur)'],
  },
  required: ['opDate', 'partner', 'amount'],
} as const satisfies TableLayout<string>;

export const n26Profile: BankProfile = {
  id: 'n26',
  institution: 'N26',
  matches: (sheet) => findHeader(sheet, LAYOUT) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet, LAYOUT);
    if (!header) throw new StatementError('formato-desconocido');
    return {
      ibanLast4: null,
      declaredFrom: null,
      declaredTo: null,
      ...readRows(sheet, header, (cell) => ({
        opDate: cellDate(cell('opDate')),
        valueDate: cellDate(cell('valueDate')),
        // Sin contraparte (p. ej. comisiones), el tipo de operación sirve de concepto.
        description:
          joinText([cell('partner'), cell('reference')], ' · ') || cellText(cell('kind')),
        amountCents: cellCents(cell('amount'), '.'),
      })),
    };
  },
};
