import { NgOptimizedImage } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';
import { buildNavItems } from '@core/navigation/nav-items';
import { ThemeService } from '@core/theme/theme-service';
import { DbService } from '@data/db/db-service';

/** Barra lateral: marca, una entrada por sección, acceso a la demo y el modo oscuro. */
@Component({
  selector: 'app-sidebar',
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSlideToggleModule,
    RouterLink,
    RouterLinkActive,
  ],
  template: `
    <header class="brand">
      <img ngSrc="logo.svg" width="36" height="36" alt="" priority />
      <h1 class="brand-name">{{ texts.app.name }}</h1>
    </header>
    <nav [attr.aria-label]="texts.nav.label">
      <p class="section-label" aria-hidden="true">{{ texts.nav.section }}</p>
      <mat-nav-list>
        @for (item of items; track item.path) {
          <a
            mat-list-item
            [routerLink]="item.path"
            routerLinkActive
            #active="routerLinkActive"
            [routerLinkActiveOptions]="{ exact: item.path === '/' }"
            ariaCurrentWhenActive="page"
            [activated]="active.isActive"
            (click)="navigate.emit()"
          >
            @if (item.icon) {
              <mat-icon matListItemIcon aria-hidden="true">{{ item.icon }}</mat-icon>
            }
            <span matListItemTitle>{{ item.label }}</span>
          </a>
        }
      </mat-nav-list>
    </nav>
    <footer class="footer">
      @if (db.mode() !== 'demo') {
        <a mat-stroked-button class="demo-link" routerLink="/demo" (click)="navigate.emit()">
          <mat-icon aria-hidden="true">science</mat-icon>
          {{ texts.demo.open }}
        </a>
      }
      <mat-slide-toggle labelPosition="before" [checked]="theme.isDark()" (change)="theme.toggle()">
        <span class="toggle-label">
          <mat-icon aria-hidden="true">dark_mode</mat-icon>
          {{ texts.theme.dark }}
        </span>
      </mat-slide-toggle>
    </footer>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 24px 16px;
      box-sizing: border-box;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px 24px;
    }

    .brand-name {
      margin: 0;
      font: var(--mat-sys-title-large);
      font-weight: 600;
      color: var(--mat-sys-primary);
    }

    .section-label {
      margin: 0 0 8px;
      padding: 0 16px;
      font: var(--mat-sys-label-small);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    mat-nav-list {
      padding: 0;
      --mat-list-active-indicator-shape: 12px;
      --mat-list-list-item-container-shape: 12px;
      --mat-list-active-indicator-color: color-mix(
        in srgb,
        var(--mat-sys-primary) 12%,
        transparent
      );
      --mat-list-list-item-label-text-color: var(--mat-sys-on-surface-variant);
      --mat-list-list-item-leading-icon-color: var(--mat-sys-on-surface-variant);
    }

    a[mat-list-item] {
      margin-bottom: 4px;
    }

    a[aria-current='page'] {
      --mat-list-list-item-label-text-color: var(--mat-sys-primary);
      --mat-list-list-item-hover-label-text-color: var(--mat-sys-primary);
      --mat-list-list-item-focus-label-text-color: var(--mat-sys-primary);
      --mat-list-list-item-leading-icon-color: var(--mat-sys-primary);
      --mat-list-list-item-hover-leading-icon-color: var(--mat-sys-primary);
      --mat-list-list-item-label-text-weight: 600;
    }

    .footer {
      margin-top: auto;
      padding: 16px 8px 0;
    }

    .demo-link {
      width: 100%;
      margin-bottom: 16px;
    }

    mat-slide-toggle {
      width: 100%;
    }

    .toggle-label {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class Sidebar {
  protected readonly texts = TEXTS;
  protected readonly items = buildNavItems(inject(Router).config);
  protected readonly theme = inject(ThemeService);
  protected readonly db = inject(DbService);

  /** Se emite al elegir una sección (p. ej. para cerrar el panel en móvil). */
  readonly navigate = output();
}
