import { Route, Routes } from '@angular/router';

/** Elemento de la navegación principal, derivado de la configuración de rutas. */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string | undefined;
}

/**
 * Extrae los elementos de navegación de las rutas: toda ruta con `title`
 * estático aparece en el menú. Se excluyen comodines, redirecciones, rutas
 * con parámetros y las marcadas con `data: { nav: false }`. El icono
 * (Material Symbols) se declara en `data: { icon }`.
 */
export function buildNavItems(routes: Routes, parentPath = ''): NavItem[] {
  return routes.flatMap((route) => {
    const path = joinPath(parentPath, route.path ?? '');
    const children = route.children ? buildNavItems(route.children, path) : [];
    return isNavigable(route, path) ? [toNavItem(route, path), ...children] : children;
  });
}

function isNavigable(route: Route, path: string): route is Route & { title: string } {
  return (
    typeof route.title === 'string' &&
    route.redirectTo === undefined &&
    route.path !== '**' &&
    !path.includes(':') &&
    route.data?.['nav'] !== false
  );
}

function toNavItem(route: Route & { title: string }, path: string): NavItem {
  const icon: unknown = route.data?.['icon'];
  return {
    path: `/${path}`,
    label: route.title,
    icon: typeof icon === 'string' ? icon : undefined,
  };
}

function joinPath(parent: string, child: string): string {
  return [parent, child].filter(Boolean).join('/');
}
