import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { DemoBanner } from '@core/layout/demo-banner';
import { Sidebar } from '@core/layout/sidebar';
import { TEXTS } from '@core/i18n/texts';
import { map } from 'rxjs';

/** Por debajo de este ancho la barra lateral pasa a ser un panel desplegable. */
const COMPACT_QUERY = '(max-width: 839.98px)';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    DemoBanner,
    Sidebar,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        #sidenav
        [mode]="compact() ? 'over' : 'side'"
        [opened]="!compact()"
        [fixedInViewport]="compact()"
      >
        <app-sidebar (navigate)="compact() && sidenav.close()" />
      </mat-sidenav>
      <mat-sidenav-content>
        @if (compact()) {
          <mat-toolbar>
            <button
              mat-icon-button
              type="button"
              [attr.aria-label]="texts.nav.openMenu"
              (click)="sidenav.open()"
            >
              <mat-icon aria-hidden="true">menu</mat-icon>
            </button>
            <h1 class="toolbar-title">{{ texts.app.name }}</h1>
          </mat-toolbar>
        }
        <app-demo-banner />
        <main>
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly texts = TEXTS;
  protected readonly compact = toSignal(
    inject(BreakpointObserver)
      .observe(COMPACT_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
}
