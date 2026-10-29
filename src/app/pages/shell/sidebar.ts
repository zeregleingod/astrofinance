import { NgOptimizedImage } from '@angular/common';
import { Component, booleanAttribute, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TEXTS } from '@ui/texts';
import { DemoBanner } from './demo-banner';
import { buildNavItems, groupNavItems } from './nav-items';
import { ThemeService } from '@services/theme/theme-service';
import { DbService } from '@services/db/db-service';

/**
 * Barra lateral: marca, accesos rápidos (los que se proyecten y el modo oscuro), una entrada por
 * sección (agrupadas en apartados) y acceso a la demo (o su aviso, dentro de ella). En
 * escritorio se pliega a una franja con solo los iconos; sus nombres salen al pasar por encima
 * y siguen ahí para los lectores de pantalla.
 */
@Component({
  selector: 'app-sidebar',
  host: { '[class.collapsed]': 'collapsed()' },
  imports: [
    DemoBanner,
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
  ],
  template: `
    <header class="brand">
      <img ngSrc="logo.svg" width="36" height="36" alt="" priority />
      <h1 class="brand-name">{{ texts.app.name }}</h1>
      @if (collapsible()) {
        <button
          mat-icon-button
          type="button"
          class="collapse-toggle"
          aria-controls="main-nav"
          [attr.aria-expanded]="!collapsed()"
          [attr.aria-label]="collapsed() ? texts.nav.expand : texts.nav.collapse"
          [matTooltip]="collapsed() ? texts.nav.expand : texts.nav.collapse"
          matTooltipPosition="right"
          (click)="collapseToggle.emit()"
        >
          <mat-icon
            [fontIcon]="collapsed() ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'"
            aria-hidden="true"
          />
        </button>
      }
    </header>
    <div class="quick-actions" role="group" [attr.aria-label]="texts.quickActions.label">
      <ng-content />
      <button
        mat-icon-button
        type="button"
        [attr.aria-label]="texts.theme.dark"
        [attr.aria-pressed]="theme.isDark()"
        [matTooltip]="texts.theme.dark"
        (click)="theme.toggle()"
      >
        <mat-icon [fontIcon]="theme.isDark() ? 'dark_mode' : 'light_mode'" aria-hidden="true" />
      </button>
    </div>
    <nav id="main-nav" [attr.aria-label]="texts.nav.label">
      @for (section of sections; track section.label) {
        <p class="section-label" aria-hidden="true">{{ section.label ?? texts.nav.section }}</p>
        <mat-nav-list [attr.aria-label]="section.label ?? texts.nav.section">
          @for (item of section.items; track item.path) {
            <a
              mat-list-item
              [routerLink]="item.path"
              routerLinkActive
              #active="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: item.path === '/' }"
              ariaCurrentWhenActive="page"
              [activated]="active.isActive"
              [matTooltip]="item.label"
              matTooltipPosition="right"
              [matTooltipDisabled]="!collapsed()"
              (click)="navigate.emit()"
            >
              @if (item.icon) {
                <mat-icon matListItemIcon aria-hidden="true">{{ item.icon }}</mat-icon>
              }
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
        </mat-nav-list>
      }
    </nav>
    <footer class="footer">
      <!--
        Dentro de la demo, su aviso y la salida. Fuera, abrirla descarta la BD abierta: no se
        ofrece si ya hay algo del usuario en ella.
      -->
      @if (db.mode() === 'demo') {
        <app-demo-banner [rail]="collapsed()" (exited)="navigate.emit()" />
      } @else if (!db.hasUserData() && collapsed()) {
        <a
          mat-icon-button
          class="demo-link"
          routerLink="/demo"
          [attr.aria-label]="texts.demo.open"
          [matTooltip]="texts.demo.open"
          matTooltipPosition="right"
          (click)="navigate.emit()"
        >
          <mat-icon aria-hidden="true">science</mat-icon>
        </a>
      } @else if (!db.hasUserData()) {
        <a mat-stroked-button class="demo-link" routerLink="/demo" (click)="navigate.emit()">
          <mat-icon aria-hidden="true">science</mat-icon>
          {{ texts.demo.open }}
        </a>
      }
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
      gap: 8px;
      padding: 0 8px 16px;
    }

    /* Debajo de los accesos rápidos, una línea los separa del menú. */
    .quick-actions {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      padding: 0 4px 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface-variant);
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

    /* Entre un apartado y el siguiente, una línea, como en la barra plegada. */
    mat-nav-list + .section-label {
      margin-top: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
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
      --mat-list-list-item-leading-icon-end-space: 12px;
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
    }

    .brand-name {
      flex: 1;
    }

    .collapse-toggle {
      --mat-icon-button-state-layer-size: 32px;

      flex: none;
      padding: 4px;
      color: var(--mat-sys-on-surface-variant);
    }

    /*
      Plegada: una franja con los iconos centrados. Los nombres quedan para los lectores de
      pantalla y salen en un aviso al pasar por encima.
    */
    :host(.collapsed) {
      align-items: center;
      padding-inline: 12px;
    }

    :host(.collapsed) .brand,
    :host(.collapsed) .quick-actions {
      flex-direction: column;
      padding-inline: 0;
    }

    /* La línea, del ancho de las que separan los apartados. */
    :host(.collapsed) .quick-actions {
      align-items: center;
      width: 56px;
    }

    :host(.collapsed) .collapse-toggle {
      margin: 0;
    }

    :host(.collapsed) .brand,
    :host(.collapsed) a[mat-list-item] {
      position: relative;
    }

    :host(.collapsed) .brand-name,
    :host(.collapsed) [matListItemTitle] {
      position: absolute;
      top: 0;
      left: 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    /* Sin rótulos (ya los llevan las listas como nombre accesible): una línea separa los apartados. */
    :host(.collapsed) .section-label {
      display: none;
    }

    :host(.collapsed) mat-nav-list ~ mat-nav-list {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    :host(.collapsed) nav {
      width: 56px;
    }

    :host(.collapsed) .footer {
      padding-inline: 0;
    }

    :host(.collapsed) .demo-link {
      width: auto;
    }
  `,
})
export class Sidebar {
  protected readonly texts = TEXTS;
  protected readonly sections = groupNavItems(buildNavItems(inject(Router).config));
  protected readonly theme = inject(ThemeService);
  protected readonly db = inject(DbService);

  /** Plegada: solo los iconos. */
  readonly collapsed = input(false, { transform: booleanAttribute });
  /** Ofrece el botón de plegar y desplegar (en escritorio; en móvil es un panel). */
  readonly collapsible = input(false, { transform: booleanAttribute });
  /** Se pide plegar o desplegar. */
  readonly collapseToggle = output();

  /** Se emite al elegir una sección (p. ej. para cerrar el panel en móvil). */
  readonly navigate = output();
}
