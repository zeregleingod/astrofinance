import { Routes } from '@angular/router';
import { demoGuard } from '@core/demo/demo-guard';
import { TEXTS } from '@core/i18n/texts';

/**
 * Cada ruta con `title` aparece en la barra lateral con ese texto; el icono
 * (Material Symbols) se indica en `data.icon` y `data.nav: false` la oculta. Las hijas de una
 * ruta con `data.section` se agrupan en el menú bajo ese apartado.
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
  {
    path: 'importar',
    title: TEXTS.imports.title,
    data: { icon: 'upload_file' },
    loadComponent: () => import('@features/imports/import-page').then((m) => m.ImportPage),
  },
  {
    path: 'configuracion',
    data: { section: TEXTS.settings.title },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'categorias' },
      {
        path: 'categorias',
        title: TEXTS.categories.title,
        data: { icon: 'category' },
        loadComponent: () =>
          import('@features/settings/categories-page').then((m) => m.CategoriesPage),
      },
    ],
  },
  // Abre la BD de demo (en memoria, nunca se guarda) y redirige al Resumen.
  { path: 'demo', canActivate: [demoGuard], children: [] },
  { path: '**', redirectTo: '' },
];
