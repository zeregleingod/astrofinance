import { StatementError } from '../bank-statement';
import { assertEuro, findHeader, joinText, readPreamble } from './table';

describe('readPreamble', () => {
  it.each([
    [[['Cuenta', 'ES12 0049 1500 0512 3456 7890']], '7890'],
    [[['Número de cuenta: ES12-0049-1500-05-1234567891']], '7891'],
    [[['IBAN', null, 'ES12 **** **** **** 4321']], '4321'],
    // Los dígitos de la celda vecina (un año) no se juntan con los de la cuenta.
    [
      [
        ['Titular', 'X'],
        ['Account', '0049150005', '2026'],
      ],
      '0005',
    ],
    [[['Tipo de cuenta', 'Corriente']], null],
    [[['Fecha', '17/08/2026']], null],
  ])('%j → %s', (rows, last4) => {
    expect(readPreamble(rows)).toEqual({ ibanLast4: last4 });
  });

  it('se queda con la primera cuenta que encuentra', () => {
    const rows = [
      ['Cuenta', 'ES12 0049 1500 0512 3456 1111'],
      ['Cuenta destino', 'ES12 0049 1500 0512 3456 2222'],
    ];
    expect(readPreamble(rows).ibanLast4).toBe('1111');
  });

  it('comprueba la divisa declarada', () => {
    expect(() =>
      readPreamble([
        ['Divisa', 'EUR'],
        ['Moneda:', '', '€'],
      ]),
    ).not.toThrow();
    expect(() => readPreamble([['Moneda', 'USD']])).toThrow(StatementError);
  });
});

describe('ayudantes de tabla', () => {
  it('findHeader exige las columnas obligatorias y señala las opcionales que faltan', () => {
    const layout = {
      columns: { date: ['fecha', 'date'], amount: ['importe'], balance: ['saldo'] },
      required: ['date', 'amount'],
    } as const;
    expect(findHeader([['x'], ['Importe', 'DATE']], layout)).toEqual({
      row: 1,
      columns: { date: 1, amount: 0, balance: -1 },
    });
    expect(findHeader([['Fecha', 'Saldo']], layout)).toBeUndefined();
  });

  it('joinText omite celdas vacías', () => {
    expect(joinText(['A', null, ' ', 'B', undefined, 3])).toBe('A B 3');
    expect(joinText(['A', 'B'], ' · ')).toBe('A · B');
  });

  it('assertEuro acepta el euro escrito de varias formas o vacío', () => {
    for (const cell of ['EUR', 'eur', '€', 'Euros', '', null, undefined]) {
      expect(() => assertEuro(cell)).not.toThrow();
    }
    expect(() => assertEuro('USD')).toThrow(StatementError);
  });
});
