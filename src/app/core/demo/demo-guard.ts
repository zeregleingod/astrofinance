import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { DbService } from '@data/db/db-service';

/**
 * `/demo`: empieza a abrir la BD de demo y lleva al Resumen sin esperar; las páginas
 * muestran «Cargando…» o el error a partir de `DbService.status`.
 */
export const demoGuard: CanActivateFn = () => {
  inject(DbService)
    .openDemo()
    .catch(() => undefined);
  return inject(Router).createUrlTree(['/']);
};
