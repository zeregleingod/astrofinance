import { NgOptimizedImage } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TEXTS } from '@ui/texts';
import { PreferenceButtons } from './preference-buttons';

/**
 * Las páginas públicas sin BD abierta (ADR-0032): en lugar de la landing, la página de la ruta con
 * la barra de la landing (marca, idioma y tema) y la vuelta al inicio.
 */
@Component({
  selector: 'app-public-frame',
  imports: [
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    PreferenceButtons,
    RouterLink,
    RouterOutlet,
  ],
  template: `
    <header class="top">
      <h1 class="brand">
        <img ngSrc="logo.svg" width="36" height="36" alt="" priority />
        <span>{{ texts.app.name }}</span>
      </h1>
      <div class="tools"><app-preference-buttons /></div>
    </header>
    <main>
      <a mat-button routerLink="/" class="back">
        <mat-icon fontIcon="arrow_back" aria-hidden="true" />
        {{ texts.privacy.back }}
      </a>
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
      box-sizing: border-box;
      background: var(--mat-sys-surface);
    }

    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px clamp(16px, 3vw, 32px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font: var(--mat-sys-title-large);
      font-weight: 600;
      color: var(--mat-sys-primary);
    }

    .tools {
      display: flex;
      gap: 4px;
      color: var(--mat-sys-on-surface-variant);
    }

    main {
      width: min(76ch, 100%);
      box-sizing: border-box;
      margin: 0 auto;
      padding: 0 clamp(16px, 3vw, 32px) 48px;
    }

    .back {
      margin: 0 0 16px -12px;
    }
  `,
})
export class PublicFrame {
  protected readonly texts = TEXTS;
}
