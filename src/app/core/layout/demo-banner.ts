import { Component, booleanAttribute, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { DbService } from '@data/db/db-service';
import { TEXTS } from '@core/i18n/texts';

/**
 * Aviso del modo demo. En la barra lateral, una tarjeta con la salida siempre a mano; en la
 * barra superior del móvil (`compact`), solo una etiqueta: la salida está en el menú. En el menú
 * plegado (`rail`), solo el botón de salir, con el aviso para los lectores de pantalla. Ninguno
 * ocupa sitio sobre las páginas.
 */
@Component({
  selector: 'app-demo-banner',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (db.mode() === 'demo') {
      @if (rail()) {
        <div role="status">
          <span class="visually-hidden">{{ texts.demo.banner }}</span>
          <button
            mat-icon-button
            type="button"
            class="rail"
            [attr.aria-label]="texts.demo.exit"
            [matTooltip]="texts.demo.banner + ' ' + texts.demo.exit"
            matTooltipPosition="right"
            (click)="exit()"
          >
            <mat-icon aria-hidden="true">logout</mat-icon>
          </button>
        </div>
      } @else if (compact()) {
        <p class="tag" role="status">
          <mat-icon aria-hidden="true">science</mat-icon>
          <span aria-hidden="true">{{ texts.demo.tag }}</span>
          <span class="visually-hidden">{{ texts.demo.banner }}</span>
        </p>
      } @else {
        <div class="card" role="status">
          <p class="text">
            <mat-icon aria-hidden="true">science</mat-icon>
            {{ texts.demo.banner }}
          </p>
          <button mat-stroked-button type="button" (click)="exit()">{{ texts.demo.exit }}</button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .card {
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      --mat-button-outlined-label-text-color: var(--mat-sys-on-tertiary-container);
      --mat-button-outlined-outline-color: var(--mat-sys-on-tertiary-container);

      button {
        width: 100%;
      }
    }

    .text {
      display: flex;
      gap: 8px;
      margin: 0 0 12px;
      font: var(--mat-sys-body-small);

      mat-icon {
        flex: none;
        width: 20px;
        height: 20px;
        font-size: 20px;
      }
    }

    .rail {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin: 0;
      padding: 2px 10px 2px 6px;
      border-radius: 999px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-large);

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
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
export class DemoBanner {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly router = inject(Router);

  /** Solo la etiqueta, para la barra superior del móvil. */
  readonly compact = input(false, { transform: booleanAttribute });
  /** Solo el botón de salir, para el menú lateral plegado. */
  readonly rail = input(false, { transform: booleanAttribute });
  /** Se emite al salir de la demo (p. ej. para cerrar el menú en móvil). */
  readonly exited = output();

  protected exit(): void {
    this.db.close();
    this.exited.emit();
    void this.router.navigateByUrl('/');
  }
}
