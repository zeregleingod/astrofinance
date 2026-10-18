import {
  formatIsoDate,
  isIsoDate,
  isPeriod,
  isoDate,
  periodParts,
  periodYears,
  resolvePeriod,
  resolveYear,
  shiftPeriod,
} from './period';

describe('fechas ISO', () => {
  it('compone fechas reales y rechaza las imposibles', () => {
    expect(isoDate(2026, 1, 30)).toBe('2026-01-30');
    expect(isoDate(2024, 2, 29)).toBe('2024-02-29');
    expect(isoDate(2026, 2, 29)).toBeNull();
    expect(isoDate(2026, 13, 1)).toBeNull();
    expect(isoDate(2026, 1, 0)).toBeNull();
    expect(isoDate(26, 1, 1)).toBeNull();
    expect(isoDate(10000, 1, 1)).toBeNull();
  });

  it('valida textos AAAA-MM-DD', () => {
    expect(isIsoDate('2026-01-30')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('30/01/2026')).toBe(false);
    expect(isIsoDate(20260130)).toBe(false);
  });
});

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

  it('da los años con datos, sin repetir y en orden', () => {
    expect(periodYears(['2025-11', '2025-12', '2026-01', '2026-09'])).toEqual([2025, 2026]);
    expect(periodYears([])).toEqual([]);
  });

  it('usa el año pedido si tiene datos y si no el más reciente', () => {
    expect(resolveYear('2025', [2025, 2026])).toBe(2025);
    expect(resolveYear('2024', [2025, 2026])).toBe(2026);
    expect(resolveYear('dos mil', [2025, 2026])).toBe(2026);
    expect(resolveYear(undefined, [2025, 2026])).toBe(2026);
    expect(resolveYear('2025', [])).toBeUndefined();
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
