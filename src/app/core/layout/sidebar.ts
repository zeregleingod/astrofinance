import { NgOptimizedImage } from '@angular/common';
import { Component, inject, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';
import { buildNavItems } from '@core/navigation/nav-items';

/** Barra lateral: logo, nombre de la aplicación y una entrada por sección. */
@Component({
  selector: 'app-sidebar',
  imports: [NgOptimizedImage, MatIconModule, MatListModule, RouterLink, RouterLinkActive],
  template: `
    <header class="brand">
      <img ngSrc="logo.svg" width="40" height="40" alt="" priority />
      <h1 class="brand-name">{{ texts.app.name }}</h1>
    </header>
    <nav [attr.aria-label]="texts.nav.label">
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
  `,
  styles: `
    :host {
      display: block;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
    }

    .brand-name {
      margin: 0;
      font: var(--mat-sys-title-large);
    }
  `,
})
export class Sidebar {
  protected readonly texts = TEXTS;
  protected readonly items = buildNavItems(inject(Router).config);

  /** Se emite al elegir una sección (p. ej. para cerrar el panel en móvil). */
  readonly navigate = output();
}
