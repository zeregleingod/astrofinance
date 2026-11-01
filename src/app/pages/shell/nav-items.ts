import { Route, Routes } from '@angular/router';

/** Elemento de la navegación principal, derivado de la configuración de rutas. */
export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: string | undefined;
  /** Apartado del menú; `undefined` = el principal. */
  readonly section: string | undefined;
}

/** Elementos del menú que comparten apartado. */
export interface NavSection {
  readonly label: string | undefined;
  readonly items: readonly NavItem[];
}

/**
 * Extrae los elementos de navegación de las rutas: toda ruta con `title` aparece en el menú.
 * Se excluyen comodines, redirecciones, rutas con parámetros y las marcadas con
 * `data: { nav: false }`. El icono (Material Symbols) se declara en `data: { icon }` y el
 * apartado del menú en `data: { section }`, que heredan las rutas hijas.
 *
 * El título y el apartado son un texto o una función sin argumentos que lo devuelve en el idioma
 * del momento (ADR-0027): llamada desde un `computed`, el menú cambia con el idioma.
 */
export function buildNavItems(routes: Routes, parentPath = '', parentSection?: string): NavItem[] {
  return routes.flatMap((route) => {
    const path = joinPath(parentPath, route.path ?? '');
    const section = routeText(route.data?.['section']) ?? parentSection;
    const children = route.children ? buildNavItems(route.children, path, section) : [];
    return isNavigable(route, path) ? [toNavItem(route, path, section), ...children] : children;
  });
}

/** Agrupa los elementos por apartado, en el orden en que aparece cada uno. */
export function groupNavItems(items: readonly NavItem[]): NavSection[] {
  const labels = [...new Set(items.map((item) => item.section))];
  return labels.map((label) => ({
    label,
    items: items.filter((item) => item.section === label),
  }));
}

/** Un texto de la configuración de rutas: tal cual o el que devuelve su función. */
export function routeText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value !== 'function') return undefined;
  const text: unknown = (value as () => unknown)();
  return typeof text === 'string' ? text : undefined;
}

function isNavigable(route: Route, path: string): boolean {
  return (
    routeText(route.title) !== undefined &&
    route.redirectTo === undefined &&
    route.path !== '**' &&
    !path.includes(':') &&
    route.data?.['nav'] !== false
  );
}

function toNavItem(route: Route, path: string, section: string | undefined): NavItem {
  const icon: unknown = route.data?.['icon'];
  return {
    path: `/${path}`,
    label: routeText(route.title) ?? '',
    icon: typeof icon === 'string' ? icon : undefined,
    section,
  };
}

function joinPath(parent: string, child: string): string {
  return [parent, child].filter(Boolean).join('/');
}
