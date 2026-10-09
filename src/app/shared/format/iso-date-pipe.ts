import { Pipe, type PipeTransform } from '@angular/core';
import { formatIsoDate } from '@domain/dates/period';

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
@Pipe({ name: 'isoDate' })
export class IsoDatePipe implements PipeTransform {
  transform(iso: string): string {
    return formatIsoDate(iso);
  }
}
