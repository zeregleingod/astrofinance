import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';

/**
 * El `title` de cada ruta es el nombre de la sección (el que aparece en la
 * navegación); el título del documento le añade el nombre de la aplicación.
 */
@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const section = this.buildTitle(snapshot);
    this.title.setTitle(section ? `${section} · ${TEXTS.app.name}` : TEXTS.app.name);
  }
}
