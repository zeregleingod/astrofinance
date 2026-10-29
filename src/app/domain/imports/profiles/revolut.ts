import type { BankProfile } from '../bank-profile';
import { StatementError } from '../bank-statement';
import { cellCents, cellDate, cellLabel, cellText } from '../cells';
import { SKIP_ROW, assertEuro, findHeader, readRows, type TableLayout } from './table';

/**
 * Revolut, «Extracto» en CSV: `Type | Product | Started Date | Completed Date | Description |
 * Amount | Fee | Currency | State | Balance`, o sus nombres en español si la aplicación está en
 * español. Fechas `aaaa-mm-dd hh:mm:ss` y punto decimal. La comisión va aparte y el saldo ya la
 * descuenta, así que el importe del movimiento es `Amount - Fee`. No trae la cuenta propia.
 */
const LAYOUT = {
  columns: {
    started: ['started date', 'fecha de inicio'],
    completed: ['completed date', 'fecha de finalizacion', 'fecha de realizacion'],
    description: ['description', 'descripcion'],
    kind: ['type', 'tipo'],
    amount: ['amount', 'importe'],
    fee: ['fee', 'comision'],
    currency: ['currency', 'divisa'],
    state: ['state', 'estado'],
    balance: ['balance', 'saldo'],
  },
  required: ['started', 'description', 'amount', 'state'],
} as const satisfies TableLayout<string>;

/** Operaciones que no han llegado a la cuenta, o que se han deshecho. */
const NOT_SETTLED =
  /^(pending|declined|reverted|failed|cancel|pendiente|rechazad|revertid|fallid|cancelad)/;

export const revolutProfile: BankProfile = {
  id: 'revolut',
  institution: 'Revolut',
  matches: (sheet) => findHeader(sheet, LAYOUT) !== undefined,
  parse(sheet) {
    const header = findHeader(sheet, LAYOUT);
    if (!header) throw new StatementError('formato-desconocido');
    return {
      ibanLast4: null,
      declaredFrom: null,
      declaredTo: null,
      ...readRows(sheet, header, (cell) => {
        if (NOT_SETTLED.test(cellLabel(cell('state')))) return SKIP_ROW;
        assertEuro(cell('currency'));
        const amount = cellCents(cell('amount'), '.');
        const fee = cellText(cell('fee')) === '' ? 0 : cellCents(cell('fee'), '.');
        return {
          opDate: cellDate(cell('started')),
          valueDate: cellDate(cell('completed')),
          description: cellText(cell('description')) || cellText(cell('kind')),
          amountCents: amount === null || fee === null ? null : amount - fee,
          balanceAfterCents: cellCents(cell('balance'), '.'),
        };
      }),
    };
  },
};
