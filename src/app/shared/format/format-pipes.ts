import { Pipe, type PipeTransform } from '@angular/core';
import { TEXTS } from '@core/i18n/texts';
import { formatIsoDate, periodParts } from '@domain/dates/period';
import { formatCents } from '@domain/money/format-cents';

/** Céntimos enteros → `-1.110,70 €`. */
@Pipe({ name: 'cents' })
export class CentsPipe implements PipeTransform {
  transform(cents: number): string {
    return formatCents(cents);
  }
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
@Pipe({ name: 'isoDate' })
export class IsoDatePipe implements PipeTransform {
  transform(iso: string): string {
    return formatIsoDate(iso);
  }
}

/** `2026-09` → `septiembre de 2026`. */
export function periodLabel(period: string): string {
  const { year, month } = periodParts(period);
  return `${TEXTS.period.months[month - 1]} de ${year}`;
}

@Pipe({ name: 'periodLabel' })
export class PeriodLabelPipe implements PipeTransform {
  transform(period: string): string {
    return periodLabel(period);
  }
}
