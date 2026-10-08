import { Routes } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';

/**
 * Cada ruta con `title` aparece en la barra lateral con ese texto; el icono
 * (Material Symbols) se indica en `data.icon` y `data.nav: false` la oculta.
 */
export const routes: Routes = [
  {
    path: '',
    title: TEXTS.dashboard.title,
    data: { icon: 'dashboard' },
    loadComponent: () => import('@features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  { path: '**', redirectTo: '' },
];
