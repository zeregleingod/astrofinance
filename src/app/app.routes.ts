import { Routes } from '@angular/router';
import { demoGuard } from '@core/demo/demo-guard';
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
  {
    path: 'movimientos',
    title: TEXTS.transactions.title,
    data: { icon: 'receipt_long' },
    loadComponent: () =>
      import('@features/transactions/transactions-page').then((m) => m.TransactionsPage),
  },
  // Abre la BD de demo (en memoria, nunca se guarda) y redirige al Resumen.
  { path: 'demo', canActivate: [demoGuard], children: [] },
  { path: '**', redirectTo: '' },
];
