import { formatCents } from './format-cents';

describe('formatCents', () => {
  it.each([
    [111070, '1.110,70 €'],
    [-11192, '-111,92 €'],
    [5, '0,05 €'],
    [-5, '-0,05 €'],
    [0, '0,00 €'],
    [100, '1,00 €'],
    [123456789, '1.234.567,89 €'],
  ])('%i céntimos → %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected.replace(' €', ' €'));
  });

  it('sin el símbolo del euro, para las tablas donde ya lo dice el título', () => {
    expect(formatCents(-34782, { currency: false })).toBe('-347,82');
    expect(formatCents(697303, { currency: false })).toBe('6.973,03');
  });

  it('rechaza importes que no son céntimos enteros seguros', () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
    expect(() => formatCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
