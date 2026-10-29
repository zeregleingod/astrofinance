import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@ui/texts';
import { canSplit, type TransactionRow } from '@domain/reports/transaction-row';
import { CentsPipe } from '@ui/format/cents-pipe';
import { IsoDatePipe } from '@ui/format/iso-date-pipe';

/** Un movimiento con sus etiquetas y sus vínculos ya traducidos. */
export type TransactionCard = TransactionRow & {
  readonly tags: readonly string[];
  readonly linkTexts: readonly string[];
};

/** La fecha del bloque de la ficha: «14», «oct», «2026». */
interface DateParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

/**
 * Los movimientos en pantallas estrechas y en la vista detallada: una ficha por movimiento. Arriba,
 * la fecha en un bloque, el concepto con su categoría y cuenta, y el importe; debajo, las
 * etiquetas, un panel con el concepto del banco, la nota, la fecha original y los vínculos, los
 * submovimientos y las devoluciones en sus apartados y, al pie, las acciones con su nombre. Nada se
 * recorta: los textos largos saltan de línea.
 */
@Component({
  selector: 'app-transaction-cards',
  imports: [CentsPipe, IsoDatePipe, MatButtonModule, MatIconModule],
  host: { '[class.detailed]': 'detailed()' },
  template: `
    <section aria-labelledby="cards-title">
      <h3 id="cards-title" class="title">{{ texts.transactions.caption }} ({{ count() }})</h3>
      <ul class="list">
        @for (row of rows(); track row.id) {
          @let date = dateParts(row.bookedDate);
          <li class="card">
            <!-- El color de su categoría, como la banda del resumen anual: atributo SVG, sin estilos en línea. -->
            <svg class="band" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
              <rect width="1" height="1" [attr.fill]="row.categoryColor" />
            </svg>
            <div class="main">
              <!-- La fecha completa, para lectores de pantalla; a la vista, en un bloque. -->
              <div class="date" [class.date-changed]="row.dateChanged">
                <span class="visually-hidden"
                  >{{ row.bookedDate | isoDate }}
                  @if (row.dateChanged) {
                    {{ texts.transactions.dateChanged }}
                  }
                </span>
                <span class="day" aria-hidden="true">{{ date.day }}</span>
                <span class="month" aria-hidden="true">{{ date.month }}</span>
                <span class="year" aria-hidden="true">{{ date.year }}</span>
              </div>
              <div class="title-block">
                <p class="description">
                  @if (row.links.length > 0) {
                    <button
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
                      [title]="row.linkTexts.join('\\n')"
                      (click)="linked.emit(row)"
                    >
                      <mat-icon fontIcon="link" aria-hidden="true" />
                    </button>
                  }
                  {{ row.description }}
                </p>
                <p class="sub">
                  {{ row.categoryName ?? texts.dashboard.uncategorized }}
                  @if (row.subcategoryName) {
                    › {{ row.subcategoryName }}
                  }
                  · {{ row.accountName }}
                </p>
              </div>
              <span
                class="amount"
                [class.positive]="row.amountCents > 0"
                [class.negative]="row.amountCents < 0"
                >{{ row.amountCents | cents }}</span
              >
            </div>

            @if (row.tags.length > 0) {
              <div class="chips">
                @for (tag of row.tags; track tag) {
                  <span class="badge">{{ tag }}</span>
                }
              </div>
            }

            <!-- El concepto del banco, solo si el usuario lo ha cambiado. -->
            @let bank =
              row.originalDescription !== row.description ? row.originalDescription : null;
            @if (bank || row.note || row.dateChanged || hasOtherLinks(row)) {
              <dl class="panel">
                @if (bank) {
                  <div class="kv bank">
                    <mat-icon fontIcon="account_balance" aria-hidden="true" />
                    <dt>{{ texts.transactions.edit.bankDescription }}</dt>
                    <dd class="mono">{{ bank }}</dd>
                  </div>
                }
                @if (row.note) {
                  <div class="kv notes">
                    <mat-icon fontIcon="sticky_note_2" aria-hidden="true" />
                    <dt>{{ texts.transactions.notes }}</dt>
                    <dd>{{ row.note }}</dd>
                  </div>
                }
                @if (row.dateChanged) {
                  <div class="kv original-date">
                    <mat-icon fontIcon="edit_calendar" aria-hidden="true" />
                    <dt>{{ texts.transactions.originalDate }}</dt>
                    <dd>{{ row.opDate | isoDate }}</dd>
                  </div>
                }
                <!-- Las devoluciones ya van en su apartado, debajo: aquí, el resto de vínculos. -->
                @for (link of row.links; track link.transactionId; let index = $index) {
                  @if (link.kind !== 'refundedBy') {
                    <div class="kv link">
                      <mat-icon fontIcon="link" aria-hidden="true" />
                      <dt>{{ texts.transactions.cards.link }}</dt>
                      <dd>{{ row.linkTexts[index] }}</dd>
                    </div>
                  }
                }
              </dl>
            }

            @if (row.splits.length > 0) {
              <div class="section">
                <h4 class="label">{{ texts.transactions.cards.splits }}</h4>
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
              </div>
            }

            @if (row.refunds.length > 0) {
              <div class="section">
                <h4 class="label">{{ texts.transactions.cards.refunds }}</h4>
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
              </div>
            }

            <!-- Las acciones, con su nombre a la vista; el aria-label dice además de qué movimiento. -->
            <div class="foot">
              @if (row.refundable) {
                <button
                  mat-button
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
                  (click)="refund.emit(row)"
                >
                  <mat-icon fontIcon="undo" aria-hidden="true" />
                  {{ texts.transactions.cards.refunds }}
                </button>
              }
              <button
                mat-button
                type="button"
                class="split"
                disabledInteractive
                [disabled]="!canSplit(row)"
                [attr.aria-label]="
                  (!canSplit(row)
                    ? texts.transactions.splits.linked
                    : row.splits.length > 0
                      ? texts.transactions.splits.manage
                      : texts.transactions.splits.open) +
                  ': ' +
                  row.description +
                  ', ' +
                  (row.bookedDate | isoDate)
                "
                [title]="canSplit(row) ? '' : texts.transactions.splits.linked"
                (click)="canSplit(row) && split.emit(row)"
              >
                <mat-icon fontIcon="call_split" aria-hidden="true" />
                {{
                  row.splits.length > 0
                    ? texts.transactions.cards.splits
                    : texts.transactions.cards.split
                }}
              </button>
              <button
                mat-button
                type="button"
                class="edit"
                [attr.aria-label]="
                  texts.transactions.edit.open +
                  ': ' +
                  row.description +
                  ', ' +
                  (row.bookedDate | isoDate)
                "
                (click)="edit.emit(row)"
              >
                <mat-icon fontIcon="edit" aria-hidden="true" />
                {{ texts.transactions.cards.edit }}
              </button>
            </div>
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

      // Lo que va bajo la cabecera se alinea con el concepto, no con el bloque de la fecha.
      --date-size: 52px;
      --indent: calc(var(--date-size) + 14px);
    }

    .title {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      // Referencia de la banda; la recorta con su esquina redondeada.
      position: relative;
      overflow: clip;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 16px 6px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .band {
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
    }

    // Sin color propio: el atributo «fill» no existe y se usa el neutro del tema.
    .band rect:not([fill]) {
      fill: var(--mat-sys-outline-variant);
    }

    // --- Cabecera: fecha, concepto e importe ---

    .main {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .date {
      display: flex;
      flex: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: var(--date-size);
      height: var(--date-size);
      border-radius: 12px;
      background: color-mix(
        in srgb,
        var(--mat-sys-primary) 7%,
        var(--mat-sys-surface-container-lowest)
      );
      font-variant-numeric: tabular-nums;
      line-height: 1.15;
    }

    .day {
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      line-height: 1.1;
    }

    .month,
    .year {
      font: var(--mat-sys-label-small);
      line-height: 1.2;
      color: var(--mat-sys-on-surface-variant);
    }

    .month {
      text-transform: uppercase;
    }

    // Fecha imputada distinta de la original: otro color, y la original en el panel (no solo color).
    .date-changed {
      background: var(--mat-sys-tertiary-container);

      .day,
      .month,
      .year {
        color: var(--mat-sys-on-tertiary-container);
      }
    }

    .title-block {
      flex: 1;
      min-width: 0;
    }

    .description {
      margin: 0;
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }

    .sub {
      margin: 2px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }

    .amount {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .main > .amount {
      font: var(--mat-sys-title-small);
      font-weight: 600;
    }

    .positive {
      color: var(--af-positive);
    }

    .negative {
      color: var(--af-negative);
    }

    // Delante del concepto de un movimiento vinculado (ADR-0022).
    button.linked {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin: -4px 2px -4px -4px;
      padding: 0;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--mat-sys-primary);
      vertical-align: middle;
      cursor: pointer;

      &:hover {
        background: color-mix(in srgb, var(--mat-sys-primary) 10%, transparent);
      }

      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 1px;
      }

      mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
    }

    // --- Etiquetas, panel de detalles y apartados, alineados con el concepto ---

    .chips,
    .panel,
    .section {
      margin-inline-start: var(--indent);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .badge {
      padding: 1px 10px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-block: 0;
      padding: 10px 14px;
      border-radius: 12px;
      background: color-mix(
        in srgb,
        var(--mat-sys-primary) 4%,
        var(--mat-sys-surface-container-lowest)
      );
    }

    .kv {
      display: grid;
      grid-template-columns: 18px 150px minmax(0, 1fr);
      align-items: start;
      gap: 10px;
      font: var(--mat-sys-body-small);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
        color: var(--mat-sys-on-surface-variant);
      }

      dt {
        color: var(--mat-sys-on-surface-variant);
      }

      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
    }

    .notes dd {
      font-style: italic;
    }

    .original-date dd {
      color: var(--mat-sys-tertiary);
      font-weight: 600;
    }

    .link mat-icon {
      color: var(--mat-sys-primary);
    }

    .mono {
      font-family: ui-monospace, Consolas, monospace;
      letter-spacing: 0.01em;
    }

    .label {
      margin: 0 0 4px;
      font: var(--mat-sys-label-small);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    // Cada submovimiento o devolución: concepto e importe en una línea, el resto debajo.
    .splits li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0 12px;
      padding: 8px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-small);

      &:first-child {
        border-top: none;
        padding-top: 2px;
      }
    }

    .splits .amount {
      grid-row: 1 / 3;
      grid-column: 2;
      align-self: center;
      font: var(--mat-sys-body-medium);
      font-weight: 600;
    }

    .split-description {
      overflow-wrap: anywhere;
    }

    .split-place {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      color: var(--mat-sys-on-surface-variant);
    }

    // --- Acciones al pie ---

    .foot {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 2px;
      padding-top: 4px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .empty {
      padding-bottom: 16px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
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

    // En móvil, el panel y los apartados ocupan todo el ancho: no sobra sitio para sangrarlos.
    @media (width < 600px) {
      .panel,
      .section {
        margin-inline-start: 0;
      }

      .kv {
        grid-template-columns: 18px minmax(0, 1fr);

        dd {
          grid-column: 2;
        }
      }
    }

    // Vista detallada en escritorio: más aire y letra más grande, para leer con calma.
    :host(.detailed) {
      --date-size: 56px;

      .card {
        padding: 18px 20px 8px;
      }

      .description,
      .main > .amount {
        font: var(--mat-sys-title-medium);
      }

      .main > .amount {
        font-weight: 600;
      }

      .sub,
      .kv,
      .splits li {
        font: var(--mat-sys-body-medium);
      }

      .day {
        font: var(--mat-sys-title-large);
        font-weight: 600;
        line-height: 1.1;
      }
    }
  `,
})
export class TransactionCards {
  protected readonly texts = TEXTS;
  protected readonly canSplit = canSplit;

  /** Vista detallada en escritorio: las mismas fichas, con más aire. */
  readonly detailed = input(false);
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

  /** `AAAA-MM-DD` → día, mes abreviado y año, para el bloque de la fecha. */
  protected dateParts(iso: string): DateParts {
    const [year = '', month = '', day = ''] = iso.split('-');
    const name = TEXTS.period.months[Number(month) - 1] ?? '';
    return { day, month: name.slice(0, 3), year };
  }

  protected hasOtherLinks(row: TransactionCard): boolean {
    return row.links.some((link) => link.kind !== 'refundedBy');
  }
}
