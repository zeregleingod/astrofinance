import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  DOCUMENT,
  LOCALE_ID,
  effect,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { AppTitleStrategy } from '@pages/shell/app-title-strategy';
import { DbService } from '@services/db/db-service';
import { language } from '@ui/texts';
import { routes } from './app.routes';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Los importes y las fechas se escriben a la española en cualquier idioma (ADR-0027).
    { provide: LOCALE_ID, useValue: 'es-ES' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'EUR' },
    provideAppInitializer(() => {
      // `mat-ligature-font` permite <mat-icon fontIcon="..."> (el nombre no queda en el texto).
      inject(MatIconRegistry).setDefaultFontSetClass(
        'material-symbols-outlined',
        'mat-ligature-font',
      );
      // `<html lang>` sigue al idioma de la interfaz (lectores de pantalla, guiones, ortografía).
      const root = inject(DOCUMENT).documentElement;
      effect(() => (root.lang = language()));
      // Los nombres de las categorías, también en el idioma elegido (ADR-0028).
      const db = inject(DbService);
      effect(() => void db.useCategoryLanguage(language()).catch(() => undefined));
    }),
  ],
};
