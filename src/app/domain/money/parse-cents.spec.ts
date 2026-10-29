import { centsToInput, numberToCents, parseCents } from './parse-cents';

describe('parseCents', () => {
  it.each([
    ['1.234,56', 123456],
    ['-12,3', -1230],
    ['12', 1200],
    ['+5,00', 500],
    ['65,47 €', 6547],
    [' 1 234,5 ', 123450],
    ['−0,01', -1],
    ['1.000.000', 100000000],
    ['0', 0],
  ])('%s → %i', (text, cents) => {
    expect(parseCents(text)).toBe(cents);
  });

  it.each(['', 'abc', '1,234', '1.23,45', '12,3,4', '1e3', '--5', '12.5', '9'.repeat(20)])(
    'rechaza «%s»',
    (text) => {
      expect(parseCents(text)).toBeNull();
    },
  );

  it('admite el sufijo EUR', () => {
    expect(parseCents('-8,00EUR')).toBe(-800);
    expect(parseCents('1.200,00 eur')).toBe(120000);
  });

  it.each([
    ['-12.5', -1250],
    ['1,234.56', 123456],
    ['1500', 150000],
    ['+0.99', 99],
    ['3.500000', 350],
  ])('con punto decimal: %s → %i', (text, cents) => {
    expect(parseCents(text, '.')).toBe(cents);
  });

  it.each(['1.500,00', '12,5', '1.234', '3.501', ''])('con punto decimal rechaza «%s»', (text) => {
    expect(parseCents(text, '.')).toBeNull();
  });
});

describe('numberToCents', () => {
  it('redondea el ruido binario de los decimales', () => {
    expect(numberToCents(-69.09)).toBe(-6909);
    expect(numberToCents(5281.82)).toBe(528182);
    expect(numberToCents(-200)).toBe(-20000);
  });

  it('rechaza lo que no son céntimos exactos', () => {
    expect(numberToCents(1.005)).toBeNull();
    expect(numberToCents(Number.NaN)).toBeNull();
    expect(numberToCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(numberToCents(1e20)).toBeNull();
  });
});

describe('centsToInput', () => {
  it('escribe el importe sin miles ni símbolo', () => {
    expect(centsToInput(-123456)).toBe('-1234,56');
    expect(centsToInput(5)).toBe('0,05');
    expect(centsToInput(-1)).toBe('-0,01');
    expect(parseCents(centsToInput(-9900))).toBe(-9900);
  });

  it('rechaza importes no enteros', () => {
    expect(() => centsToInput(1.5)).toThrow(RangeError);
  });
});
