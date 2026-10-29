import {
  BANK_SHEETS,
  DEMO_HOLDER,
  DEMO_IBANS,
  type DemoBank,
} from '../../../../testing/bank-sheets';
import { sabadellSheet } from '../../../../testing/sabadell-sheet';
import { BANK_PROFILES, parseStatement } from '../bank-profiles';
import { StatementError, type RawSheet } from '../bank-statement';
import { checkBalances } from '../imported-statement';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof StatementError) return error.code;
    throw error;
  }
  return undefined;
};

const banks = Object.keys(BANK_SHEETS) as DemoBank[];
const setCell = (sheet: RawSheet, row: number, column: number, value: string): RawSheet =>
  sheet.map((cells, i) =>
    i === row ? cells.map((cell, j) => (j === column ? value : cell)) : cells,
  );
const replaceCell = (sheet: RawSheet, from: string, to: string): RawSheet =>
  sheet.map((row) => row.map((cell) => (cell === from ? to : cell)));

describe('perfiles bancarios', () => {
  it.each(banks)('%s: solo su perfil reconoce su hoja', (bank) => {
    const matching = BANK_PROFILES.filter((profile) => profile.matches(BANK_SHEETS[bank]));
    expect(matching.map((profile) => profile.id)).toEqual([bank]);
  });

  it('ningún perfil nuevo reconoce la hoja del Sabadell', () => {
    const matching = BANK_PROFILES.filter((profile) => profile.matches(sabadellSheet()));
    expect(matching.map((profile) => profile.id)).toEqual(['sabadell']);
  });

  it.each(banks)('%s: nunca deja pasar el titular ni ningún IBAN completo', (bank) => {
    const json = JSON.stringify(parseStatement(BANK_SHEETS[bank]));
    expect(json).not.toContain(DEMO_HOLDER);
    for (const iban of Object.values(DEMO_IBANS)) {
      expect(json).not.toContain(iban);
      expect(json).not.toContain(iban.replaceAll(' ', ''));
    }
  });

  it.each(banks)('%s: los saldos cuadran y no hay filas con error', (bank) => {
    const statement = parseStatement(BANK_SHEETS[bank]);
    expect(statement.errors).toEqual([]);
    expect(checkBalances(statement.movements).balanceMismatchRows).toEqual([]);
  });
});

describe('perfil BBVA', () => {
  it('lee la cuenta y los movimientos; sin concepto usa el tipo de movimiento', () => {
    const statement = parseStatement(BANK_SHEETS.bbva);
    expect(statement).toMatchObject({
      profileId: 'bbva',
      institution: 'BBVA',
      ibanLast4: '1234',
      dateFrom: '2026-01-28',
      dateTo: '2026-01-30',
    });
    expect(statement.movements).toEqual([
      {
        row: 6,
        opDate: '2026-01-30',
        valueDate: '2026-01-31',
        description: 'MERCADONA DEMO',
        amountCents: -4520,
        balanceAfterCents: 95480,
        reference: 'Tarjeta 4000XXXXXXXX0001',
      },
      {
        row: 7,
        opDate: '2026-01-28',
        valueDate: '2026-01-28',
        description: 'Abono de nómina',
        amountCents: 100000,
        balanceAfterCents: 100000,
        reference: null,
      },
    ]);
  });

  it('rechaza movimientos en otra divisa', () => {
    const sheet = setCell(BANK_SHEETS.bbva, 5, 5, 'USD');
    expect(code(() => parseStatement(sheet))).toBe('divisa-no-admitida');
  });
});

describe('perfil Bankinter', () => {
  it('lee fechas de texto y de Excel', () => {
    const statement = parseStatement(BANK_SHEETS.bankinter);
    expect(statement).toMatchObject({ profileId: 'bankinter', ibanLast4: '5678' });
    expect(statement.movements.map((m) => [m.opDate, m.description, m.amountCents])).toEqual([
      ['2026-01-30', 'RECIBO LUZ DEMO', -6050],
      ['2026-01-02', 'TRANSF DEMO', 50000],
    ]);
  });
});

describe('perfil CaixaBank', () => {
  it('une movimiento y más datos, y lee importes con «EUR»', () => {
    const statement = parseStatement(BANK_SHEETS.caixabank);
    expect(statement).toMatchObject({ profileId: 'caixabank', ibanLast4: '9012' });
    expect(
      statement.movements.map((m) => [m.description, m.amountCents, m.balanceAfterCents]),
    ).toEqual([
      ['COMPRA TARJETA SUPERMERCADO DEMO', -1234, 98766],
      ['TRANSFERENCIA', 100000, 100000],
    ]);
  });
});

describe('perfil ING', () => {
  it('toma la fecha valor como fecha de operación y el comentario como referencia', () => {
    const statement = parseStatement(BANK_SHEETS.ing);
    expect(statement).toMatchObject({ profileId: 'ing', ibanLast4: '3456' });
    expect(statement.movements[1]).toEqual({
      row: 7,
      opDate: '2026-01-10',
      valueDate: null,
      description: 'Nómina recibida EMPRESA DEMO',
      amountCents: 10000,
      balanceAfterCents: 10000,
      reference: 'extra',
    });
  });
});

describe('perfil Banco Santander', () => {
  it('lee la cuenta y los movimientos', () => {
    const statement = parseStatement(BANK_SHEETS.santander);
    expect(statement).toMatchObject({ profileId: 'santander', ibanLast4: '7890' });
    expect(statement.movements.map((m) => [m.opDate, m.amountCents, m.balanceAfterCents])).toEqual([
      ['2026-01-29', -999, 19001],
      ['2026-01-15', 20000, 20000],
    ]);
  });

  it('admite la divisa en el nombre de la columna', () => {
    const sheet = replaceCell(BANK_SHEETS.santander, 'Importe', 'Importe EUR');
    expect(parseStatement(sheet).movements).toHaveLength(2);
  });

  it('rechaza un preámbulo que declara otra divisa', () => {
    const sheet: RawSheet = [['Divisa:', 'GBP'], ...BANK_SHEETS.santander];
    expect(code(() => parseStatement(sheet))).toBe('divisa-no-admitida');
  });
});

describe('perfil N26', () => {
  it('lee el CSV con punto decimal; sin contraparte usa el tipo', () => {
    const statement = parseStatement(BANK_SHEETS.n26);
    expect(statement).toMatchObject({ profileId: 'n26', ibanLast4: null });
    expect(statement.movements.map((m) => [m.description, m.amountCents, m.valueDate])).toEqual([
      ['Empresa Demo SL · Nómina enero', 150000, '2026-01-28'],
      ['Cafetería Demo', -350, '2026-01-31'],
      ['N26 Fee', -290, '2026-01-31'],
    ]);
  });

  it('reconoce también la versión anterior del CSV', () => {
    const sheet: RawSheet = [
      ['Date', 'Payee', 'Account number', 'Transaction type', 'Payment reference', 'Amount (EUR)'],
      ['2026-01-30', 'Cafetería Demo', '', 'MasterCard Payment', '', '-3.50'],
    ];
    expect(parseStatement(sheet)).toMatchObject({
      profileId: 'n26',
      movements: [{ opDate: '2026-01-30', description: 'Cafetería Demo', amountCents: -350 }],
    });
  });
});

describe('perfil Revolut', () => {
  it('descuenta la comisión y omite lo pendiente o rechazado', () => {
    const statement = parseStatement(BANK_SHEETS.revolut);
    expect(statement).toMatchObject({
      profileId: 'revolut',
      ibanLast4: null,
      dateFrom: '2026-01-02',
      dateTo: '2026-01-07',
    });
    expect(statement.movements.map((m) => [m.row, m.amountCents, m.balanceAfterCents])).toEqual([
      [2, 10000, 10000],
      [3, -350, 9650],
      [4, -1050, 8600],
    ]);
  });

  it('reconoce la exportación en español', () => {
    const sheet: RawSheet = [
      [
        'Tipo',
        'Producto',
        'Fecha de inicio',
        'Fecha de finalización',
        'Descripción',
        'Importe',
        'Comisión',
        'Divisa',
        'Estado',
        'Saldo',
      ],
      [
        'Pago con tarjeta',
        'Actual',
        '2026-01-05 12:00:00',
        '2026-01-06 08:00:00',
        'Cafetería Demo',
        '-3.50',
        '0.00',
        'EUR',
        'COMPLETADO',
        '96.50',
      ],
      [
        'Pago con tarjeta',
        'Actual',
        '2026-01-08 12:00:00',
        '',
        'Tienda Demo',
        '-1.00',
        '0.00',
        'EUR',
        'PENDIENTE',
        '',
      ],
    ];
    expect(parseStatement(sheet)).toMatchObject({
      profileId: 'revolut',
      movements: [{ description: 'Cafetería Demo', amountCents: -350 }],
    });
  });

  it('rechaza movimientos en otra divisa y marca importes ilegibles', () => {
    const usd = setCell(BANK_SHEETS.revolut, 2, 7, 'USD');
    expect(code(() => parseStatement(usd))).toBe('divisa-no-admitida');

    const badFee = setCell(BANK_SHEETS.revolut, 2, 6, 'n/d');
    expect(parseStatement(badFee).errors).toEqual([{ row: 3, field: 'importe' }]);
  });
});
