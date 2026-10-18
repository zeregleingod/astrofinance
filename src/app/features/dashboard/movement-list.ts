import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TEXTS } from '@core/i18n/texts';
import type { Movement } from '@domain/reports/month-report';
import { CentsPipe } from '@shared/format/cents-pipe';
import { IsoDatePipe } from '@shared/format/iso-date-pipe';

/**
 * Movimientos de una línea del resumen: fecha, concepto e importe, como en la hoja. Lo devuelto
 * por la otra persona se marca con un icono y lo dice también con texto.
 */
@Component({
  selector: 'app-movement-list',
  imports: [CentsPipe, IsoDatePipe, MatIconModule],
  template: `
    <ul [attr.aria-label]="label()">
      @for (movement of movements(); track movement.key) {
        <li [class.reimbursed]="movement.reimbursed">
          <span class="date">{{ movement.date | isoDate }}</span>
          <span class="concept">
            @if (movement.reimbursed) {
              <mat-icon
                class="mark"
                fontIcon="undo"
                aria-hidden="true"
                [title]="texts.dashboard.reimbursedHint"
              />
              <span class="visually-hidden">{{ texts.dashboard.reimbursed }}:</span>
            }
            {{ movement.description }}
          </span>
          <span
            class="amount"
            [class.positive]="movement.amountCents > 0"
            [class.negative]="movement.amountCents < 0"
            >{{ movement.amountCents | cents }}</span
          >
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    // Fecha, concepto con el ancho que sobra (salta de línea, nunca se recorta) e importe.
    li {
      position: relative;
      display: grid;
      grid-template-columns: 4.75rem minmax(0, 1fr) auto;
      align-items: baseline;
      gap: 8px;
      padding: 3px 8px;
      margin: 0 -8px;
      border-radius: 6px;
      font: var(--mat-sys-body-small);
    }

    .date {
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }

    .concept {
      overflow-wrap: anywhere;
    }

    .amount {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;

      &.positive {
        color: var(--af-positive);
      }

      &.negative {
        color: var(--af-negative);
      }
    }

    // La fila bajo el cursor se resalta, como en las tablas.
    li:hover {
      background: var(--af-row-hover);
    }

    .mark {
      width: 14px;
      height: 14px;
      margin-right: 4px;
      font-size: 14px;
      vertical-align: -2px;
      color: var(--mat-sys-on-surface-variant);
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
export class MovementList {
  protected readonly texts = TEXTS;

  readonly movements = input.required<readonly Movement[]>();
  /** Nombre de la lista para lectores de pantalla (la subcategoría). */
  readonly label = input.required<string>();
}
