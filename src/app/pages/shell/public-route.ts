import { Service, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** Ruta de la política de privacidad (ADR-0032). */
export const PRIVACY_PATH = 'privacidad';

/**
 * Las páginas que se ven también sin BD abierta, en lugar de la landing (ADR-0032): solo la
 * política de privacidad. Se decide por la ruta, sin la consulta ni el fragmento.
 */
export function isPublicUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path.replace(/\/+$/, '') === `/${PRIVACY_PATH}`;
}

/** Si la dirección actual es una página pública (ver `isPublicUrl`). */
@Service()
export class PublicRoute {
  private readonly router = inject(Router);

  readonly active = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => isPublicUrl(event.urlAfterRedirects)),
    ),
    { initialValue: isPublicUrl(this.router.url) },
  );
}
