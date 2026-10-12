import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { dateToIso, isoToDate, provideEsDatepicker } from './es-datepicker';

describe('selector de fecha en español', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideEsDatepicker()] });
    return TestBed.inject<DateAdapter<Date>>(DateAdapter);
  }
  const iso = (date: Date | null) =>
    date && !Number.isNaN(date.getTime()) ? dateToIso(date) : null;

  it('lee las fechas escritas como día/mes/año', () => {
    const adapter = setup();
    expect(iso(adapter.parse('01/08/2026', null))).toBe('2026-08-01');
    expect(iso(adapter.parse(' 1/8/2026 ', null))).toBe('2026-08-01');
    expect(iso(adapter.parse('31-12-2025', null))).toBe('2025-12-31');
    expect(iso(adapter.parse('5.3.2026', null))).toBe('2026-03-05');
  });

  it('un campo vacío no es una fecha; lo que no se entiende es una fecha no válida', () => {
    const adapter = setup();
    expect(adapter.parse('', null)).toBeNull();
    expect(adapter.parse('   ', null)).toBeNull();
    for (const text of ['mañana', '31/02/2026', '1/13/2026', '01/08/26', '2026-08-01']) {
      const parsed = adapter.parse(text, null);
      expect(parsed && adapter.isValid(parsed), text).toBe(false);
    }
  });

  it('las enseña como dd/mm/aaaa y empieza la semana en lunes', () => {
    const adapter = setup();
    const date = isoToDate('2026-08-01');
    if (!date) throw new Error('Sin fecha');
    expect(adapter.format(date, { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe(
      '01/08/2026',
    );
    expect(adapter.getFirstDayOfWeek()).toBe(1);
  });

  it('convierte entre fecha y AAAA-MM-DD sin desfases de zona horaria', () => {
    expect(dateToIso(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
    expect(dateToIso(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(isoToDate('2026-02-30')).toBeNull();
    expect(isoToDate('')).toBeNull();
  });

  it('pone en español los textos del calendario', () => {
    setup();
    const intl = TestBed.inject(MatDatepickerIntl);
    expect(intl.openCalendarLabel).toBe('Abrir el calendario');
    expect(intl.nextMonthLabel).toBe('Mes siguiente');
  });
});
