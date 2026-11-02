import { Injectable, effect, inject, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TEXTS, language } from '@ui/texts';
import { LandingGate } from './landing-gate';
import { routeText } from './nav-items';
import { isPublicUrl } from './public-route';

/**
 * El `title` de cada ruta es el nombre de la sección (el que aparece en la
 * navegación); el título del documento le añade el nombre de la aplicación.
 * Al cambiar de idioma se vuelve a escribir en el nuevo (ADR-0027). En la landing, que no es
 * ninguna sección, solo el nombre de la aplicación (ADR-0029); las páginas públicas, que se ven sin
 * BD, llevan el suyo (ADR-0032).
 */
@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly gate = inject(LandingGate);
  private snapshot: RouterStateSnapshot | null = null;

  constructor() {
    super();
    effect(() => {
      language();
      this.gate.inside();
      untracked(() => this.apply());
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.snapshot = snapshot;
    this.apply();
  }

  private apply(): void {
    if (!this.snapshot) return;
    if (!this.gate.inside() && !isPublicUrl(this.snapshot.url)) {
      this.title.setTitle(TEXTS.app.name);
      return;
    }
    const section = sectionTitle(this.snapshot) ?? this.buildTitle(this.snapshot);
    this.title.setTitle(section ? `${section} · ${TEXTS.app.name}` : TEXTS.app.name);
  }
}

/** El título de la ruta más profunda que lo tiene, leído ahora (no el resuelto al navegar). */
function sectionTitle(snapshot: RouterStateSnapshot): string | undefined {
  let found: string | undefined;
  for (let route = snapshot.root.firstChild; route; route = route.firstChild) {
    found = routeText(route.routeConfig?.title) ?? found;
  }
  return found;
}
