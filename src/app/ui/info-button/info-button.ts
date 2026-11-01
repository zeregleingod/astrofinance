import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  type ConnectedOverlayPositionChange,
  type ConnectedPosition,
} from '@angular/cdk/overlay';
import { hasModifierKey } from '@angular/cdk/keycodes';
import { Component, ElementRef, input, model, signal, viewChild } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TEXTS } from '@ui/texts';

/** Debajo del icono, alineado con él; si no cabe, encima, o hacia la izquierda. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
];

/**
 * Botón con el icono de información que abre un globo con la explicación junto al icono, por
 * encima del contenido: no lo desplaza. Se cierra con el mismo botón, con Escape o pulsando fuera.
 */
@Component({
  selector: 'app-info-button',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, MatIconButton, MatIcon],
  template: `
    <button
      #button
      mat-icon-button
      type="button"
      class="info"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [attr.aria-controls]="open() ? infoId() : null"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="texts.categories.moreInfo + ': ' + topic()"
      [title]="texts.categories.moreInfo"
      (click)="open.set(!open())"
    >
      <mat-icon fontIcon="info" aria-hidden="true" />
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayViewportMargin]="8"
      (positionChange)="placed($event)"
      (overlayOutsideClick)="outside($event)"
      (overlayKeydown)="keydown($event)"
      (detach)="close()"
    >
      <p class="bubble" role="note" [id]="infoId()" [class.above]="above()" [class.end]="end()">
        {{ text() }}
      </p>
    </ng-template>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .info {
      --mat-icon-button-state-layer-size: 32px;
      --mat-icon-button-icon-size: 20px;

      padding: 6px;
      color: var(--mat-sys-on-surface-variant);

      &[aria-expanded='true'] {
        color: var(--mat-sys-primary);
      }
    }

    .bubble {
      position: relative;
      box-sizing: border-box;
      max-width: min(360px, calc(100vw - 16px));
      // Si no cabe entero, la capa lo estrecha hasta el borde de la pantalla: que no lo toque.
      margin: 0 8px 0 0;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      font: var(--mat-sys-body-medium);
      box-shadow: var(--mat-sys-level2);

      // El pico apunta al centro del icono (32px de ancho).
      &::before {
        content: '';
        position: absolute;
        top: -6px;
        left: 10px;
        width: 12px;
        height: 12px;
        background: inherit;
        transform: rotate(45deg);
      }

      &.end {
        margin: 0 0 0 8px;

        &::before {
          right: 10px;
          left: auto;
        }
      }

      &.above::before {
        top: auto;
        bottom: -6px;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      .bubble {
        animation: appear 120ms ease-out;
      }

      @keyframes appear {
        from {
          opacity: 0;
          transform: scale(0.96);
        }
      }
    }
  `,
})
export class InfoButton {
  protected readonly texts = TEXTS;
  protected readonly positions = POSITIONS;

  /** De qué se informa: completa la etiqueta del botón («Más información: …»). */
  readonly topic = input.required<string>();
  /** La explicación. */
  readonly text = input.required<string>();
  /** Id del globo, para que otros controles lo usen de descripción mientras está abierto. */
  readonly infoId = input.required<string>();
  readonly open = model(false);

  protected readonly above = signal(false);
  protected readonly end = signal(false);
  private readonly button = viewChild.required('button', { read: ElementRef<HTMLElement> });

  protected placed({ connectionPair }: ConnectedOverlayPositionChange): void {
    this.above.set(connectionPair.overlayY === 'bottom');
    this.end.set(connectionPair.overlayX === 'end');
  }

  /** Pulsar el propio botón ya lo cierra con su clic. */
  protected outside(event: MouseEvent): void {
    if (!this.button().nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !hasModifierKey(event)) {
      event.preventDefault();
      this.close();
    }
  }

  /** Escape (o la navegación) quita el globo y el foco vuelve al botón. */
  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.button().nativeElement.focus();
  }
}
