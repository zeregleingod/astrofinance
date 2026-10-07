import { Routes } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';

export const routes: Routes = [
  {
    path: '',
    title: TEXTS.app.name,
    loadComponent: () => import('@features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  { path: '**', redirectTo: '' },
];
