import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@core/i18n/texts';
import type { TransactionRow } from '@domain/reports/transaction-row';
import { CentsPipe } from '@shared/format/cents-pipe';
import { IsoDatePipe } from '@shared/format/iso-date-pipe';

/** Un movimiento con sus etiquetas y sus vínculos ya traducidos. */
export type TransactionCard = TransactionRow & {
  readonly tags: readonly string[];
  readonly linkTexts: readonly string[];
};

/**
 * Los movimientos en pantallas estrechas: una tarjeta por movimiento, con el concepto y el
 * importe arriba y debajo la fecha, la categoría y lo demás. Nada se recorta: los textos largos
 * saltan de línea.
 */
@Component({
  selector: 'app-transaction-cards',
  imports: [CentsPipe, IsoDatePipe, MatButtonModule, MatIconModule],
  template: `
    <section aria-labelledby="cards-title">
      <h3 id="cards-title" class="title">{{ texts.transactions.caption }} ({{ count() }})</h3>
      <ul>
        @for (row of rows(); track row.id) {
          <li class="card">
            <div class="main">
              @if (row.links.length > 0) {
                <button
                  mat-icon-button
                  type="button"
                  class="linked"
                  [attr.data-id]="row.id"
                  [attr.aria-label]="
                    texts.transactions.links.show +
                    ' ' +
                    row.description +
                    ': ' +
                    row.linkTexts.join('; ')
                  "
                  [title]="
                    row.linkTexts.join(
                      '
'
                    )
                  "
                  (click)="linked.emit(row)"
                >
                  <mat-icon fontIcon="link" aria-hidden="true" />
                </button>
              }
              <span class="description">{{ row.description }}</span>
              <span
                class="amount"
                [class.positive]="row.amountCents > 0"
                [class.negative]="row.amountCents < 0"
                >{{ row.amountCents | cents }}</span
              >
              @if (row.refundable) {
                <button
                  mat-icon-button
                  type="button"
                  class="refund"
                  [attr.aria-label]="
                    (row.refunds.length > 0
                      ? texts.transactions.refunds.manage
                      : texts.transactions.refunds.open) +
                    ': ' +
                    row.description +
                    ', ' +
                    (row.bookedDate | isoDate)
                  "
                  [title]="
                    row.refunds.length > 0
                      ? texts.transactions.refunds.manage
                      : texts.transactions.refunds.open
                  "
                  (click)="refund.emit(row)"
                >
                  <mat-icon fontIcon="undo" aria-hidden="true" />
                </button>
              }
              <button
                mat-icon-button
                type="button"
                class="split"
                [attr.aria-label]="
                  (row.splits.length > 0
                    ? texts.transactions.splits.manage
                    : texts.transactions.splits.open) +
                  ': ' +
                  row.description +
                  ', ' +
                  (row.bookedDate | isoDate)
                "
                [title]="
                  row.splits.length > 0
                    ? texts.transactions.splits.manage
                    : texts.transactions.splits.open
                "
                (click)="split.emit(row)"
              >
                <mat-icon fontIcon="call_split" aria-hidden="true" />
              </button>
              <button
                mat-icon-button
                type="button"
                class="edit"
                [attr.aria-label]="
                  texts.transactions.edit.open +
                  ': ' +
                  row.description +
                  ', ' +
                  (row.bookedDate | isoDate)
                "
                [title]="texts.transactions.edit.open"
                (click)="edit.emit(row)"
              >
                <mat-icon fontIcon="edit" aria-hidden="true" />
              </button>
            </div>
            <div class="meta">
              <span class="date" [class.date-changed]="row.dateChanged">
                {{ row.bookedDate | isoDate }}
                @if (row.dateChanged) {
                  <mat-icon class="changed-icon" fontIcon="edit_calendar" aria-hidden="true" />
                  <span class="visually-hidden">{{ texts.transactions.dateChanged }}</span>
                }
              </span>
              <span>
                {{ row.categoryName ?? texts.dashboard.uncategorized }}
                @if (row.subcategoryName) {
                  › {{ row.subcategoryName }}
                }
              </span>
            </div>
            <div class="meta">
              @if (row.dateChanged) {
                <span>{{ texts.transactions.originalDate }}: {{ row.opDate | isoDate }}</span>
              }
              @for (tag of row.tags; track tag) {
                <span class="badge">{{ tag }}</span>
              }
              <span>{{ row.accountName }}</span>
            </div>
            @if (row.note) {
              <p class="notes">{{ row.note }}</p>
            }
            @if (row.splits.length > 0) {
              <ul class="splits">
                @for (part of row.splits; track part.id) {
                  <!-- Los espacios separan los datos también para los lectores de pantalla. -->
                  <li>
                    <span class="visually-hidden">{{ texts.transactions.splits.partOf }}</span
                    >{{ ' ' }}<span class="split-description">{{ part.description }}</span
                    >{{ ' '
                    }}<span
                      class="amount"
                      [class.positive]="part.amountCents > 0"
                      [class.negative]="part.amountCents < 0"
                      >{{ part.amountCents | cents }}</span
                    >{{ ' ' }}
                    <span class="split-place">
                      {{ part.categoryName ?? texts.dashboard.uncategorized }}
                      @if (part.subcategoryName) {
                        › {{ part.subcategoryName }}
                      }
                      @if (part.shared) {
                        <span class="badge">{{ texts.transactions.shared }}</span>
                      }
                      @if (part.refundsTo.length > 0) {
                        <span class="badge">{{ texts.transactions.splits.refunds }}</span>
                        {{ part.refundsTo.join(', ') }}
                      }
                    </span>
                  </li>
                }
              </ul>
            }
            @if (row.refunds.length > 0) {
              <ul class="splits refunds">
                @for (item of row.refunds; track item.transactionId) {
                  <li>
                    <span class="visually-hidden">{{ texts.transactions.refunds.partOf }}</span
                    >{{ ' ' }}<span class="split-description">{{ item.description }}</span
                    >{{ ' ' }}<span class="amount positive">{{ item.amountCents | cents }}</span
                    >{{ ' ' }}
                    <span class="split-place">{{ item.date | isoDate }}</span>
                  </li>
                }
              </ul>
            }
          </li>
        } @empty {
          <li class="card empty">{{ texts.transactions.noResults }}</li>
        }
      </ul>
      @if (remaining() > 0) {
        <button mat-stroked-button type="button" class="more" (click)="showMore.emit()">
          {{ texts.transactions.showMore }} ({{ texts.transactions.remaining }} {{ remaining() }})
        </button>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .title {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 14px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .description {
      flex: 1;
      min-width: 0;
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }

    .amount,
    .date {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .amount {
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }

    .positive {
      color: var(--af-positive);
    }

    .negative {
      color: var(--af-negative);
    }

    // Lo secundario, en una línea que salta si no cabe; los datos se separan con «·».
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);

      &:empty {
        display: none;
      }

      > :not(.badge) + :not(.badge)::before {
        content: '· ';
      }
    }

    // Fecha imputada distinta de la original: color, icono y texto oculto (no solo el color).
    .date-changed {
      color: var(--mat-sys-tertiary);
      font-weight: 600;
    }

    .changed-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
      vertical-align: -3px;
    }

    .badge {
      padding: 1px 8px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .notes {
      margin: 0;
      font: var(--mat-sys-body-small);
      font-style: italic;
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }

    // Los submovimientos, sangrados bajo una línea, con su concepto e importe.
    .splits {
      gap: 4px;
      margin-top: 4px;
      padding: 8px 0 0 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);

      li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0 8px;
        font: var(--mat-sys-body-small);
      }

      .amount {
        font: var(--mat-sys-body-small);
        font-weight: 600;
      }

      .split-description {
        overflow-wrap: anywhere;
      }

      .split-place {
        grid-column: 1 / -1;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .empty {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .edit,
    .split,
    .refund {
      --mat-icon-button-state-layer-size: 32px;
      --mat-icon-button-icon-size: 18px;

      flex: none;
      margin: -4px -8px -4px -4px;
      padding: 7px;
    }

    .more {
      width: 100%;
      margin-top: 12px;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class TransactionCards {
  protected readonly texts = TEXTS;

  readonly rows = input.required<readonly TransactionCard[]>();
  /** «40» o, con filtros o búsqueda, «12 de 40». */
  readonly count = input.required<string>();
  /** Movimientos que cumplen los filtros pero aún no se han pintado. */
  readonly remaining = input.required<number>();
  readonly showMore = output();
  /** Se pide editar un movimiento. */
  readonly edit = output<TransactionCard>();
  /** Se pide dividir un movimiento en submovimientos. */
  readonly split = output<TransactionCard>();
  /** Se piden las devoluciones de un gasto. */
  readonly refund = output<TransactionCard>();
  /** Se piden solo el movimiento y los vinculados con él. */
  readonly linked = output<TransactionCard>();
}
