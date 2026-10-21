import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { DemoBanner } from '@core/layout/demo-banner';
import { Sidebar } from '@core/layout/sidebar';
import { SidebarState } from '@core/layout/sidebar-state';
import { Viewport } from '@core/layout/viewport';
import { TEXTS } from '@core/i18n/texts';
import { BackupQuickActions } from '@features/settings/backup-quick-actions';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    BackupQuickActions,
    DemoBanner,
    Sidebar,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  template: `
    <!-- autosize: el contenido se recoloca al plegar o desplegar la barra lateral. -->
    <mat-sidenav-container class="shell" autosize>
      <mat-sidenav
        #sidenav
        [class.collapsed]="collapsed()"
        [mode]="compact() ? 'over' : 'side'"
        [opened]="!compact()"
        [fixedInViewport]="compact()"
      >
        <app-sidebar
          [collapsed]="collapsed()"
          [collapsible]="!compact()"
          (collapseToggle)="sidebar.toggle()"
          (navigate)="compact() && sidenav.close()"
        >
          <app-backup-quick-actions />
        </app-sidebar>
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
            <app-demo-banner class="toolbar-demo" compact />
          </mat-toolbar>
        }
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
  /** En pantallas estrechas la barra lateral pasa a ser un panel desplegable. */
  protected readonly compact = inject(Viewport).compact;
  protected readonly sidebar = inject(SidebarState);
  /** En escritorio la barra lateral se puede plegar a solo iconos; en móvil es un panel. */
  protected readonly collapsed = computed(() => !this.compact() && this.sidebar.collapsed());
}
