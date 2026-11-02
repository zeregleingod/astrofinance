import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { LandingGate } from '@pages/shell/landing-gate';
import { LandingPage } from '@pages/shell/landing-page';
import { DemoBanner } from '@pages/shell/demo-banner';
import { Sidebar } from '@pages/shell/sidebar';
import { SidebarState } from '@pages/shell/sidebar-state';
import { TabSession } from '@services/session/tab-session';
import { Viewport } from '@services/viewport/viewport';
import { TEXTS } from '@ui/texts';
import { BackupQuickActions } from '@pages/shell/backup-quick-actions';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    BackupQuickActions,
    DemoBanner,
    LandingPage,
    Sidebar,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  template: `
    <!-- Tras recargar, nada hasta retomar los datos de la pestaña (ADR-0031). -->
    @if (session.resuming()) {
      <p class="resuming" role="status">{{ texts.session.resuming }}</p>
    } @else if (!gate.inside()) {
      <!-- Sin BD abierta se ve la landing (ADR-0029); la URL se conserva para entrar en esa sección. -->
      <app-landing-page />
    } @else {
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
    }
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly texts = TEXTS;
  protected readonly gate = inject(LandingGate);
  protected readonly session = inject(TabSession);
  /** En pantallas estrechas la barra lateral pasa a ser un panel desplegable. */
  protected readonly compact = inject(Viewport).compact;
  protected readonly sidebar = inject(SidebarState);
  /** En escritorio la barra lateral se puede plegar a solo iconos; en móvil es un panel. */
  protected readonly collapsed = computed(() => !this.compact() && this.sidebar.collapsed());

  constructor() {
    void this.session.start();
  }
}
