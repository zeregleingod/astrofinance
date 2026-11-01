import { Pipe, type PipeTransform } from '@angular/core';
import { TEXTS } from '@ui/texts';
import { periodParts } from '@domain/dates/period';

/**
 * `2026-09` → `septiembre de 2026` (o `September 2026`). Impuro para que cambie con el idioma
 * aunque el periodo sea el mismo (ADR-0027); solo compone un texto corto.
 */
@Pipe({ name: 'periodLabel', pure: false })
export class PeriodLabelPipe implements PipeTransform {
  transform(period: string): string {
    const { year, month } = periodParts(period);
    return `${TEXTS.period.months[month - 1]}${TEXTS.period.monthYear}${year}`;
  }
}
