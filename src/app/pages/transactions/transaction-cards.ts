import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS, language } from '@ui/texts';
import { canSplit, type TransactionRow } from '@domain/reports/transaction-row';
import { CentsPipe } from '@ui/format/cents-pipe';
import { IsoDatePipe } from '@ui/format/iso-date-pipe';

/** Un movimiento con sus vínculos ya traducidos. */
export type TransactionCard = TransactionRow & {
  readonly linkTexts: readonly string[];
};

/** La fecha de la ficha: «14», «oct», «2026» y el día de la semana, «Miércoles». */
interface DateParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly weekday: string;
}

/**
 * Los movimientos en pantallas estrechas y en la vista detallada: una ficha por movimiento, en tres
 * zonas (ADR-0023). **Cuándo**: la fecha en un bloque, el día de la semana y la cuenta. **Qué**: el
 * concepto con su categoría y etiquetas, el concepto del banco, la nota, la fecha original y los
 * vínculos, y los submovimientos y devoluciones. **Cuánto**: el importe y las acciones, con su
 * nombre. En la vista detallada las tres zonas van en columnas; en móvil, una debajo de otra. Nada
 * se recorta: los textos largos saltan de línea.
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
            <!-- Cuándo -->
            <div class="when" [class.date-changed]="row.dateChanged">
              <!-- La fecha completa, para lectores de pantalla; a la vista, en un bloque. -->
              <div class="date">
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
              <div class="when-text">
                <span class="weekday" aria-hidden="true">{{ date.weekday }}</span>
                <span class="account">
                  <mat-icon fontIcon="account_balance_wallet" aria-hidden="true" />
                  {{ row.accountName }}
                </span>
              </div>
            </div>

            <!-- Qué -->
            <div class="main">
              <div>
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
                  <span class="category">
                    <!-- El color de su categoría: atributo SVG, sin estilos en línea. -->
                    <svg class="dot" viewBox="0 0 10 10" aria-hidden="true">
                      <circle cx="5" cy="5" r="5" [attr.fill]="row.categoryColor" />
                    </svg>
                    {{ row.categoryName ?? texts.dashboard.uncategorized }}
                    @if (row.subcategoryName) {
                      › {{ row.subcategoryName }}
                    }
                  </span>
                  @if (row.shared) {
                    <span class="badge">{{ texts.transactions.shared }}</span>
                  }
                </p>
              </div>

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
                        <mat-icon
                          class="mark"
                          fontIcon="subdirectory_arrow_right"
                          aria-hidden="true"
                        />
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
                        <mat-icon class="mark" fontIcon="undo" aria-hidden="true" />
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
            </div>

            <!-- Cuánto -->
            <div class="side">
              <span
                class="total"
                [class.positive]="row.amountCents > 0"
                [class.negative]="row.amountCents < 0"
                >{{ row.amountCents | cents }}</span
              >

              <!-- Las acciones, con su nombre a la vista; el aria-label dice además de qué movimiento. -->
              <div class="foot">
                @if (row.refundable) {
                  <button
                    [matButton]="detailed() ? 'outlined' : 'text'"
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
                  [matButton]="detailed() ? 'outlined' : 'text'"
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
                  [matButton]="detailed() ? 'filled' : 'text'"
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

      --date-size: 52px;
      --tint: color-mix(
        in srgb,
        var(--mat-sys-primary) 4%,
        var(--mat-sys-surface-container-lowest)
      );
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

    // En móvil, las tres zonas una debajo de otra: arriba la fecha y el importe, luego el concepto
    // y sus detalles y, al pie, las acciones.
    .card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'when total'
        'main main'
        'foot foot';
      gap: 12px 14px;
      padding: 16px 16px 6px;
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
      box-shadow:
        0 1px 2px color-mix(in srgb, var(--mat-sys-shadow) 4%, transparent),
        0 4px 12px color-mix(in srgb, var(--mat-sys-shadow) 5%, transparent);
    }

    // --- Cuándo ---

    .when {
      grid-area: when;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
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

    .when-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .weekday {
      color: var(--mat-sys-on-surface);
      font-weight: 500;
    }

    .account {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-wrap: anywhere;

      mat-icon {
        flex: none;
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
    }

    // Fecha imputada distinta de la original: otro color, y la original en el panel (no solo color).
    .date-changed .date {
      background: var(--mat-sys-tertiary-container);

      .day,
      .month,
      .year {
        color: var(--mat-sys-on-tertiary-container);
      }
    }

    // --- Qué ---

    .main {
      grid-area: main;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .description {
      margin: 0;
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }

    .sub {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }

    .category {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .dot {
      flex: none;
      width: 10px;
      height: 10px;
    }

    // Sin color propio: el atributo «fill» no existe y se usa el neutro del tema.
    .dot circle:not([fill]) {
      fill: var(--mat-sys-outline-variant);
    }

    .amount {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
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
      background: var(--tint);
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
      grid-template-columns: 18px minmax(0, 1fr) auto;
      gap: 0 10px;
      padding: 8px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-small);

      &:first-child {
        border-top: none;
        padding-top: 2px;
      }
    }

    .mark {
      grid-row: 1 / 3;
      align-self: center;
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--mat-sys-on-surface-variant);
    }

    .refunds .mark {
      color: var(--af-positive);
    }

    .split-description {
      grid-column: 2;
      overflow-wrap: anywhere;
    }

    .splits .amount {
      grid-row: 1 / 3;
      grid-column: 3;
      align-self: center;
      font: var(--mat-sys-body-medium);
      font-weight: 600;
    }

    .split-place {
      grid-column: 2;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      color: var(--mat-sys-on-surface-variant);
    }

    // --- Cuánto ---

    // En móvil sus piezas se colocan en la rejilla de la ficha: el importe arriba, las acciones al pie.
    .side {
      display: contents;
    }

    .total {
      grid-area: total;
      align-self: center;
      font: var(--mat-sys-title-medium);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .foot {
      grid-area: foot;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 2px;
      padding-top: 4px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .empty {
      display: block;
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

    @media (width < 600px) {
      .kv {
        grid-template-columns: 18px minmax(0, 1fr);

        dd {
          grid-column: 2;
        }
      }
    }

    // --- Vista detallada en escritorio: cuándo, qué y cuánto en tres columnas ---

    :host(.detailed) {
      --date-size: auto;

      .list {
        gap: 14px;
      }

      .card {
        grid-template-columns: 200px minmax(0, 1fr) 240px;
        grid-template-areas: 'when main side';
        gap: 0;
        padding: 0;
        overflow: clip;
      }

      .when {
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        padding: 20px;
        background: var(--tint);
        border-inline-end: 1px solid var(--mat-sys-outline-variant);
      }

      .date-changed {
        background: color-mix(
          in srgb,
          var(--mat-sys-tertiary-container) 45%,
          var(--mat-sys-surface-container-lowest)
        );
      }

      // El bloque se abre en columna: el día grande, y debajo el mes y el año.
      .date,
      .date-changed .date {
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-areas: 'day day' 'month year';
        justify-items: start;
        gap: 4px 6px;
        width: auto;
        height: auto;
        border-radius: 0;
        background: none;
      }

      .day {
        grid-area: day;
        font-size: 40px;
        line-height: 1;
        letter-spacing: -0.01em;
      }

      .month,
      .year {
        font: var(--mat-sys-label-large);
        letter-spacing: 0.04em;
      }

      .month {
        grid-area: month;
      }

      .year {
        grid-area: year;
      }

      .when-text {
        flex: 1;
        gap: 6px;
        font: var(--mat-sys-body-medium);
        color: var(--mat-sys-on-surface-variant);
      }

      .weekday {
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }

      .account {
        margin-top: auto;
        color: var(--mat-sys-on-surface);
        font-weight: 500;
      }

      .main {
        padding: 20px 24px;
      }

      .description {
        font: var(--mat-sys-title-medium);
        font-weight: 600;
      }

      .sub,
      .kv,
      .splits li {
        font: var(--mat-sys-body-medium);
      }

      // Los detalles, como líneas de etiqueta y valor, sin fondo: el tinte ya es de la fecha.
      .panel {
        padding: 0;
        background: none;
      }

      // Submovimientos y devoluciones, como una tabla: concepto, categoría o fecha, e importe.
      .section {
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 12px;
        overflow: clip;
      }

      .label {
        margin: 0;
        padding: 6px 14px;
        background: var(--tint);
      }

      .splits li {
        grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr) 110px;
        align-items: center;
        padding: 9px 14px;
        border-top: 1px solid var(--mat-sys-outline-variant);

        &:first-child {
          padding-top: 9px;
        }
      }

      .mark {
        grid-row: 1;
      }

      .split-description {
        grid-column: 2;
      }

      .split-place {
        grid-row: 1;
        grid-column: 3;
      }

      .splits .amount {
        grid-row: 1;
        grid-column: 4;
        text-align: end;
      }

      .side {
        grid-area: side;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 20px;
        border-inline-start: 1px solid var(--mat-sys-outline-variant);
      }

      .total {
        align-self: stretch;
        text-align: end;
        font: var(--mat-sys-headline-small);
        font-weight: 600;
      }

      .foot {
        flex-direction: column;
        flex-wrap: nowrap;
        gap: 8px;
        margin-top: auto;
        padding-top: 0;
        border-top: none;

        button {
          width: 100%;
        }
      }
    }
  `,
})
export class TransactionCards {
  protected readonly texts = TEXTS;
  protected readonly canSplit = canSplit;

  /** Vista detallada en escritorio: las tres zonas de la ficha en columnas. */
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

  /** `AAAA-MM-DD` → día, mes abreviado, año y día de la semana, en el idioma de la interfaz. */
  protected dateParts(iso: string): DateParts {
    const [year = '', month = '', day = ''] = iso.split('-');
    const name = TEXTS.period.months[Number(month) - 1] ?? '';
    return { day, month: name.slice(0, 3), year, weekday: weekday(iso) };
  }

  protected hasOtherLinks(row: TransactionCard): boolean {
    return row.links.some((link) => link.kind !== 'refundedBy');
  }
}

/** «Miércoles», con mayúscula; en UTC, para que el huso horario no cambie el día. */
function weekday(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const name = new Intl.DateTimeFormat(language(), { weekday: 'long', timeZone: 'UTC' }).format(
    date,
  );
  return name.charAt(0).toLocaleUpperCase(language()) + name.slice(1);
}
