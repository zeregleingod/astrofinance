import { Component, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TEXTS } from '@core/i18n/texts';

/** Qué mostrar mientras no hay una BD lista: sin datos, abriendo o con error. */
@Component({
  selector: 'app-empty-state',
  imports: [MatProgressBarModule],
  template: `
    @switch (status()) {
      @case ('abriendo') {
        <div role="status">
          <p>{{ texts.demo.loading }}</p>
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="texts.demo.loading" />
        </div>
      }
      @case ('error') {
        <p role="alert">{{ texts.demo.error }}</p>
      }
      @default {
        <p>{{ texts.dashboard.empty }}</p>
        <p class="hint">{{ texts.dashboard.emptyHint }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 520px;
      padding: 24px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }

    p {
      margin: 0 0 12px;
    }

    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 0;
    }
  `,
})
export class EmptyState {
  protected readonly texts = TEXTS;
  readonly status = input.required<'cerrada' | 'abriendo' | 'error' | 'lista'>();
}
