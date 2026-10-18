import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@core/i18n/texts';

/** Paso entre los años que tienen datos: anterior · año actual · siguiente. */
@Component({
  selector: 'app-year-nav',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button
      mat-icon-button
      type="button"
      [attr.aria-label]="texts.period.previousYear"
      [disabled]="previous() === undefined"
      (click)="go(previous())"
    >
      <mat-icon aria-hidden="true">chevron_left</mat-icon>
    </button>
    <p class="label" aria-live="polite">{{ year() }}</p>
    <button
      mat-icon-button
      type="button"
      [attr.aria-label]="texts.period.nextYear"
      [disabled]="next() === undefined"
      (click)="go(next())"
    >
      <mat-icon aria-hidden="true">chevron_right</mat-icon>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .label {
      margin: 0;
      min-width: 5em;
      text-align: center;
      font: var(--mat-sys-title-small);
    }
  `,
})
export class YearNav {
  protected readonly texts = TEXTS;

  readonly years = input.required<readonly number[]>();
  readonly year = input.required<number>();
  readonly yearChange = output<number>();

  private readonly index = computed(() => this.years().indexOf(this.year()));
  protected readonly previous = computed(() => this.years()[this.index() - 1]);
  protected readonly next = computed(() =>
    this.index() < 0 ? undefined : this.years()[this.index() + 1],
  );

  protected go(year: number | undefined): void {
    if (year !== undefined) this.yearChange.emit(year);
  }
}
