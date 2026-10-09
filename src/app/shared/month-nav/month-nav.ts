import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@core/i18n/texts';
import { PeriodLabelPipe } from '../format/period-label-pipe';

/** Paso entre los meses que tienen datos: anterior · mes actual · siguiente. */
@Component({
  selector: 'app-month-nav',
  imports: [MatButtonModule, MatIconModule, PeriodLabelPipe],
  template: `
    <button
      mat-icon-button
      type="button"
      [attr.aria-label]="texts.period.previous"
      [disabled]="!previous()"
      (click)="go(previous())"
    >
      <mat-icon aria-hidden="true">chevron_left</mat-icon>
    </button>
    <p class="label" aria-live="polite">{{ period() | periodLabel }}</p>
    <button
      mat-icon-button
      type="button"
      [attr.aria-label]="texts.period.next"
      [disabled]="!next()"
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
      min-width: 10.5em;
      text-align: center;
      font: var(--mat-sys-title-small);
    }
  `,
})
export class MonthNav {
  protected readonly texts = TEXTS;

  readonly periods = input.required<readonly string[]>();
  readonly period = input.required<string>();
  readonly periodChange = output<string>();

  private readonly index = computed(() => this.periods().indexOf(this.period()));
  protected readonly previous = computed(() => this.periods()[this.index() - 1]);
  protected readonly next = computed(() =>
    this.index() < 0 ? undefined : this.periods()[this.index() + 1],
  );

  protected go(period: string | undefined): void {
    if (period) this.periodChange.emit(period);
  }
}
