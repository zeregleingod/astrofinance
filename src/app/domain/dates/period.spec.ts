import { formatIsoDate, isPeriod, periodParts, resolvePeriod, shiftPeriod } from './period';

describe('periodos (AAAA-MM)', () => {
  it('reconoce periodos válidos', () => {
    expect(isPeriod('2026-09')).toBe(true);
    expect(isPeriod('2026-13')).toBe(false);
    expect(isPeriod('2026-00')).toBe(false);
    expect(isPeriod('2026-9')).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
  });

  it('desplaza meses cruzando años', () => {
    expect(shiftPeriod('2026-09', -1)).toBe('2026-08');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-03', -27)).toBe('2023-12');
  });

  it('descompone año y mes', () => {
    expect(periodParts('2026-02')).toEqual({ year: 2026, month: 2 });
    expect(() => periodParts('febrero')).toThrow(RangeError);
  });

  it('usa el periodo pedido si existe y si no el más reciente', () => {
    const available = ['2026-07', '2026-08', '2026-09'];
    expect(resolvePeriod('2026-08', available)).toBe('2026-08');
    expect(resolvePeriod('2025-01', available)).toBe('2026-09');
    expect(resolvePeriod(undefined, available)).toBe('2026-09');
    expect(resolvePeriod('2026-08', [])).toBeUndefined();
  });
});

describe('formatIsoDate', () => {
  it('formatea AAAA-MM-DD como dd/mm/aaaa', () => {
    expect(formatIsoDate('2026-03-05')).toBe('05/03/2026');
  });

  it('rechaza fechas fuera de formato', () => {
    expect(() => formatIsoDate('5/3/2026')).toThrow(RangeError);
  });
});
