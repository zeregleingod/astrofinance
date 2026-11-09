import { Component, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { AccountRow } from '@domain/accounts/account';
import { GettingStarted, type GettingStartedPage } from '@ui/getting-started/getting-started';
import { TEXTS } from '@ui/texts';

/**
 * Qué mostrar mientras no hay nada que enseñar: abriendo la BD, con error o, con la BD lista,
 * los primeros pasos (ADR-0035): crear la primera cuenta o importar el primer extracto de la
 * elegida.
 */
@Component({
  selector: 'app-empty-state',
  imports: [GettingStarted, MatProgressBarModule],
  template: `
    @switch (status()) {
      @case ('abriendo') {
        <div class="panel" role="status">
          <p>{{ texts.demo.loading }}</p>
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="texts.demo.loading" />
        </div>
      }
      @case ('error') {
        <p class="panel" role="alert">{{ texts.demo.error }}</p>
      }
      @case ('lista') {
        @if (noAccount() || account()) {
          <app-getting-started [page]="page()" [account]="noAccount() ? null : account()" />
        }
      }
      @default {
        <div class="panel">
          <p>{{ texts.dashboard.empty }}</p>
          <p class="hint">{{ texts.dashboard.emptyHint }}</p>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .panel {
      max-width: 520px;
      margin: 0;
      padding: 24px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .panel p {
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
  /** La página en la que se enseñan los primeros pasos. */
  readonly page = input<GettingStartedPage>('month');
  /** Todavía no hay ninguna cuenta: el primer paso es crearla. */
  readonly noAccount = input(false);
  /** La cuenta elegida, que aún no tiene movimientos: el paso que toca es importar. */
  readonly account = input<Pick<AccountRow, 'name' | 'institution'> | null>(null);
}
