import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { DbService } from '@data/db/db-service';
import { TEXTS } from '@core/i18n/texts';

/** Franja fija mientras se navega por la demo, con la salida siempre a mano. */
@Component({
  selector: 'app-demo-banner',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (db.mode() === 'demo') {
      <div class="banner" role="status">
        <mat-icon aria-hidden="true">science</mat-icon>
        <span class="text">{{ texts.demo.banner }}</span>
        <button mat-button type="button" (click)="exit()">{{ texts.demo.exit }}</button>
      </div>
    }
  `,
  styles: `
    .banner {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px 8px 24px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-body-medium);
      --mat-button-text-label-text-color: var(--mat-sys-on-tertiary-container);
    }

    .text {
      flex: 1;
    }
  `,
})
export class DemoBanner {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly router = inject(Router);

  protected exit(): void {
    this.db.close();
    void this.router.navigateByUrl('/');
  }
}
