import {
  SABADELL_HOLDER,
  SABADELL_IBAN,
  SABADELL_ROWS,
  sabadellSheet,
} from '../../../testing/sabadell-sheet';
import type { BankProfile } from './bank-profile';
import { BANK_PROFILES, parseStatement } from './bank-profiles';
import { StatementError, statementErrorCode, type RawSheet } from './bank-statement';
import { sabadellProfile } from './profiles/sabadell';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof StatementError) return error.code;
    throw error;
  }
  return undefined;
};

describe('perfil Banc Sabadell', () => {
  it('lee el extracto: cuenta, periodo y movimientos en el orden del fichero', () => {
    const statement = parseStatement(sabadellSheet());

    expect(statement).toMatchObject({
      profileId: 'sabadell',
      institution: 'Banc Sabadell',
      ibanLast4: '4321',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      errors: [],
    });
    expect(statement.movements).toHaveLength(SABADELL_ROWS.length);
    expect(statement.movements[1]).toEqual({
      row: 11,
      opDate: '2026-01-30',
      valueDate: '2026-01-31',
      description: 'PRESTAMOS ADEUDO CUOTA N.0000000001 31/01/26',
      amountCents: -55746,
      balanceAfterCents: 230403,
      reference: null,
    });
    expect(statement.movements[3]?.reference).toBe('4000__0001');
    expect(statement.movements[5]?.reference).toBe('REF-LUZ');
    expect(statement.movements.at(-1)?.description).toBe('ABONO PROMOCIÓN');
  });

  it('nunca deja pasar el titular ni el IBAN completo', () => {
    const json = JSON.stringify(parseStatement(sabadellSheet()));
    expect(json).not.toContain(SABADELL_HOLDER);
    expect(json).not.toContain('TITULAR');
    expect(json).not.toContain(SABADELL_IBAN);
    expect(json).not.toContain(SABADELL_IBAN.replaceAll(' ', ''));
  });

  it('encuentra la cabecera por nombre aunque cambien la fila y el orden de las columnas', () => {
    const sheet: RawSheet = [
      ['Cuenta', null, '0000 1111'],
      ['Divisa', 'eur'],
      [],
      ['Importe', 'CONCEPTO', ' f. operativa '],
      ['-12,30', 'Recibo', 46052],
      ['', '', ''],
      ['1.000,00', 'Nómina', '28/01/2026'],
    ];
    const statement = parseStatement(sheet);

    expect(statement.ibanLast4).toBe('1111');
    expect(statement).toMatchObject({ dateFrom: '2026-01-28', dateTo: '2026-01-30' });
    expect(statement.movements).toEqual([
      {
        row: 5,
        opDate: '2026-01-30',
        valueDate: null,
        description: 'Recibo',
        amountCents: -1230,
        balanceAfterCents: null,
        reference: null,
      },
      {
        row: 7,
        opDate: '2026-01-28',
        valueDate: null,
        description: 'Nómina',
        amountCents: 100000,
        balanceAfterCents: null,
        reference: null,
      },
    ]);
  });

  it('una fila ilegible da un error de esa fila y no aborta el resto', () => {
    const rows = [
      ['31/02/2026', 'Fecha imposible', '', -1, 0, '', ''],
      ['30/01/2026', '', '', -1, 0, '', ''],
      ['30/01/2026', 'x'.repeat(501), '', -1, 0, '', ''],
      ['30/01/2026', 'Sin importe', '', 'n/d', 0, '', ''],
      ['30/01/2026', 'Importe cero', '', 0, 0, '', ''],
      ['30/01/2026', 'Correcto', '', -1, 0, '', ''],
    ];
    const statement = parseStatement(sabadellSheet(rows));

    expect(statement.errors).toEqual([
      { row: 10, field: 'fecha' },
      { row: 11, field: 'concepto' },
      { row: 12, field: 'concepto' },
      { row: 13, field: 'importe' },
      { row: 14, field: 'importe' },
    ]);
    expect(statement.movements.map((m) => m.description)).toEqual(['Correcto']);
  });

  it('amplía el periodo declarado si algún movimiento cae fuera', () => {
    const statement = parseStatement(
      sabadellSheet([
        ['03/02/2026', 'Después', '', -1, null, '', ''],
        ['30/12/2025', 'Antes', '', -1, null, '', ''],
      ]),
    );
    expect(statement).toMatchObject({ dateFrom: '2025-12-30', dateTo: '2026-02-03' });
  });

  it('sin periodo declarado usa las fechas de los movimientos', () => {
    const sheet = sabadellSheet().map((row) =>
      row[0] === 'Selección:' ? ['Selección:', 'Últimos movimientos'] : row,
    );
    expect(parseStatement(sheet)).toMatchObject({ dateFrom: '2026-01-02', dateTo: '2026-01-30' });
  });

  it('rechaza extractos en otra divisa', () => {
    const sheet = sabadellSheet().map((row) => (row[0] === 'Divisa: ' ? ['Divisa: ', 'USD'] : row));
    expect(code(() => parseStatement(sheet))).toBe('divisa-no-admitida');
  });

  it('no reconoce una hoja sin las columnas obligatorias', () => {
    const sheet: RawSheet = [['F. Operativa', 'Concepto', 'Saldo']];
    expect(sabadellProfile.matches(sheet)).toBe(false);
    expect(code(() => sabadellProfile.parse(sheet))).toBe('formato-desconocido');
  });
});

describe('statementErrorCode', () => {
  it('recupera el código también cuando el error ha cruzado entre hilos', () => {
    const crossed = (message: string) =>
      Object.assign(new Error(message), { name: 'StatementError' });
    expect(statementErrorCode(new StatementError('sin-movimientos'))).toBe('sin-movimientos');
    expect(statementErrorCode(crossed('fichero-vacio'))).toBe('fichero-vacio');
    expect(statementErrorCode(crossed('otro'))).toBeNull();
    expect(statementErrorCode(new Error('fichero-vacio'))).toBeNull();
    expect(statementErrorCode('fichero-vacio')).toBeNull();
  });
});

describe('parseStatement', () => {
  it('rechaza hojas vacías, formatos desconocidos y extractos sin movimientos', () => {
    expect(code(() => parseStatement([]))).toBe('fichero-vacio');
    expect(code(() => parseStatement([['Fecha', 'Texto']]))).toBe('formato-desconocido');
    expect(code(() => parseStatement(sabadellSheet([])))).toBe('sin-movimientos');
  });

  it('usa el primer perfil que reconoce la hoja: añadir un banco es añadir un perfil', () => {
    const other: BankProfile = {
      id: 'otro',
      institution: 'Otro Banco',
      matches: (sheet) => sheet[0]?.[0] === 'OTRO',
      parse: () => ({
        ibanLast4: null,
        declaredFrom: null,
        declaredTo: null,
        movements: [
          {
            row: 2,
            opDate: '2026-03-05',
            valueDate: null,
            description: 'Movimiento',
            amountCents: -100,
            balanceAfterCents: null,
            reference: null,
          },
        ],
        errors: [],
      }),
    };

    expect(parseStatement([['OTRO']], [...BANK_PROFILES, other])).toMatchObject({
      profileId: 'otro',
      institution: 'Otro Banco',
      dateFrom: '2026-03-05',
      dateTo: '2026-03-05',
    });
    expect(parseStatement(sabadellSheet(), [other, ...BANK_PROFILES]).profileId).toBe('sabadell');
  });

  it('los identificadores de perfil son únicos', () => {
    const ids = BANK_PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
