import { Pipe, type PipeTransform } from '@angular/core';
import { TEXTS } from '@core/i18n/texts';
import { periodParts } from '@domain/dates/period';

/** `2026-09` → `septiembre de 2026`. */
@Pipe({ name: 'periodLabel' })
export class PeriodLabelPipe implements PipeTransform {
  transform(period: string): string {
    const { year, month } = periodParts(period);
    return `${TEXTS.period.months[month - 1]} de ${year}`;
  }
}
