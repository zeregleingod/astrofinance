import { cellCents, cellDate, cellLabel, cellText, textDate } from './cells';

describe('celdas de un extracto', () => {
  it('cellText recorta y convierte a texto', () => {
    expect(cellText('  NOMINA  ')).toBe('NOMINA');
    expect(cellText(12)).toBe('12');
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });

  it('cellLabel ignora tildes, mayúsculas y espacios repetidos', () => {
    expect(cellLabel(' F.  Operativa ')).toBe('f. operativa');
    expect(cellLabel('Selección:')).toBe('seleccion:');
  });

  it('cellDate acepta texto dd/mm/aaaa y números de serie de Excel', () => {
    expect(cellDate('30/01/2026')).toBe('2026-01-30');
    expect(cellDate('2/1/2026')).toBe('2026-01-02');
    expect(cellDate('02-01-2026')).toBe('2026-01-02');
    expect(cellDate(46052)).toBe('2026-01-30');
    expect(cellDate(46052.75)).toBe('2026-01-30');
  });

  it('cellDate acepta aaaa-mm-dd y descarta la hora', () => {
    expect(cellDate('2026-01-30')).toBe('2026-01-30');
    expect(cellDate('2026-01-30 18:04:31')).toBe('2026-01-30');
    expect(cellDate('2026-1-5T08:00')).toBe('2026-01-05');
    expect(cellDate('30/01/2026 09:15')).toBe('2026-01-30');
  });

  it('cellDate rechaza fechas imposibles o ilegibles', () => {
    expect(cellDate('31/02/2026')).toBeNull();
    expect(cellDate('2026-02-31')).toBeNull();
    expect(cellDate('30/01/26')).toBeNull();
    expect(cellDate('2026-01-30 25')).toBeNull();
    expect(cellDate('')).toBeNull();
    expect(cellDate(null)).toBeNull();
    expect(cellDate(0)).toBeNull();
    expect(cellDate(Number.NaN)).toBeNull();
    expect(cellDate(9_999_999)).toBeNull();
    expect(textDate('ayer')).toBeNull();
  });

  it('cellCents acepta números e importes es-ES en texto', () => {
    expect(cellCents(-69.09)).toBe(-6909);
    expect(cellCents('-1.234,56')).toBe(-123456);
    expect(cellCents('')).toBeNull();
    expect(cellCents(null)).toBeNull();
    expect(cellCents('doce')).toBeNull();
    expect(cellCents('-12.50', '.')).toBe(-1250);
    expect(cellCents(-12.5, '.')).toBe(-1250);
  });
});
