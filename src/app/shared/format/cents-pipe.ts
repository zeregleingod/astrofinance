import { Pipe, type PipeTransform } from '@angular/core';
import { formatCents } from '@domain/money/format-cents';

/** Céntimos enteros → `-1.110,70 €`. */
@Pipe({ name: 'cents' })
export class CentsPipe implements PipeTransform {
  transform(cents: number): string {
    return formatCents(cents);
  }
}
