import { Injectable, type Provider } from '@angular/core';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  NativeDateAdapter,
  type MatDateFormats,
} from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { TEXTS } from '@ui/texts';
import { isIsoDate } from '@domain/dates/period';

/** `d/m/aaaa`, también con guiones o puntos. */
const TYPED_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const FORMATS: MatDateFormats = {
  parse: { dateInput: null },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' },
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
  },
};

/**
 * Fechas del selector de Material a la española: se escriben `dd/mm/aaaa` (el adaptador nativo
 * las leería como mes/día) y la semana empieza en lunes.
 */
@Injectable()
export class EsDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value !== 'string') return value instanceof Date ? value : null;
    const text = value.trim();
    if (text === '') return null;
    const match = TYPED_DATE.exec(text);
    if (!match) return this.invalid();
    const [, day = '', month = '', year = ''] = match;
    return isoToDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`) ?? this.invalid();
  }

  override getFirstDayOfWeek(): number {
    return 1;
  }
}

/** `AAAA-MM-DD` → fecha local a medianoche; `null` si no es un día que exista. */
export function isoToDate(iso: string): Date | null {
  if (!isIsoDate(iso)) return null;
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** El día local de una fecha como `AAAA-MM-DD`. */
export function dateToIso(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Lo que necesita un `mat-datepicker`: fechas es-ES escritas a mano y textos en español. */
export function provideEsDatepicker(): Provider[] {
  return [
    { provide: MAT_DATE_LOCALE, useValue: 'es-ES' },
    { provide: MAT_DATE_FORMATS, useValue: FORMATS },
    { provide: DateAdapter, useClass: EsDateAdapter },
    {
      provide: MatDatepickerIntl,
      useFactory: () => Object.assign(new MatDatepickerIntl(), TEXTS.datepicker),
    },
  ];
}
