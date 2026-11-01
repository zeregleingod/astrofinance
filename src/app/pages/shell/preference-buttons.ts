import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '@services/theme/theme-service';
import { LANGUAGES, TEXTS, language, setLanguage } from '@ui/texts';

/**
 * Los botones del modo oscuro y del idioma (ADR-0027): en los accesos rápidos de la barra lateral
 * y en la barra de la landing. No ocupan caja propia: se colocan como hermanos de los botones que
 * los rodean.
 */
@Component({
  selector: 'app-preference-buttons',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
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
    <button
      mat-icon-button
      type="button"
      [attr.aria-label]="texts.language.label"
      [matTooltip]="texts.language.label"
      [matMenuTriggerFor]="languageMenu"
    >
      <mat-icon fontIcon="translate" aria-hidden="true" />
    </button>
    <mat-menu #languageMenu="matMenu" [aria-label]="texts.language.label">
      @for (option of languages; track option.code) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.lang]="option.code"
          [attr.aria-checked]="option.code === language()"
          (click)="setLanguage(option.code)"
        >
          <mat-icon [fontIcon]="option.code === language() ? 'check' : ''" aria-hidden="true" />
          <span>{{ option.name }}</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class PreferenceButtons {
  protected readonly texts = TEXTS;
  protected readonly languages = LANGUAGES;
  protected readonly language = language;
  protected readonly setLanguage = setLanguage;
  protected readonly theme = inject(ThemeService);
}
