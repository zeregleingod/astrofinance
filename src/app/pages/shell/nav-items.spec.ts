import { Routes } from '@angular/router';
import { buildNavItems, groupNavItems } from './nav-items';

describe('buildNavItems', () => {
  it('genera un elemento por cada ruta con título', () => {
    const routes: Routes = [
      { path: '', title: 'Resumen' },
      { path: 'movimientos', title: 'Movimientos' },
    ];

    expect(buildNavItems(routes)).toEqual([
      { path: '/', label: 'Resumen', icon: undefined, section: undefined },
      { path: '/movimientos', label: 'Movimientos', icon: undefined, section: undefined },
    ]);
  });

  it('usa el icono declarado en data.icon', () => {
    const routes: Routes = [{ path: '', title: 'Resumen', data: { icon: 'dashboard' } }];

    expect(buildNavItems(routes)[0]?.icon).toBe('dashboard');
  });

  it('ignora rutas sin título, comodines, redirecciones y parámetros', () => {
    const routes: Routes = [
      { path: 'sin-titulo' },
      { path: 'mes/:mes', title: 'Mes' },
      { path: 'viejo', title: 'Viejo', redirectTo: '' },
      { path: '**', redirectTo: '' },
    ];

    expect(buildNavItems(routes)).toEqual([]);
  });

  it('ignora rutas marcadas con data.nav = false', () => {
    const routes: Routes = [{ path: 'oculta', title: 'Oculta', data: { nav: false } }];

    expect(buildNavItems(routes)).toEqual([]);
  });

  it('lee los títulos y apartados que dan una función cada vez que se le pide', () => {
    let title = 'Resumen';
    let section = 'Ajustes';
    const routes: Routes = [
      {
        path: 'x',
        data: { section: () => section },
        children: [{ path: 'y', title: () => title }],
      },
    ];

    expect(buildNavItems(routes)).toEqual([
      { path: '/x/y', label: 'Resumen', icon: undefined, section: 'Ajustes' },
    ]);

    title = 'Overview';
    section = 'Settings';
    expect(buildNavItems(routes)).toEqual([
      { path: '/x/y', label: 'Overview', icon: undefined, section: 'Settings' },
    ]);
  });

  it('incluye las rutas hijas con la ruta completa', () => {
    const routes: Routes = [
      {
        path: 'ajustes',
        children: [{ path: 'categorias', title: 'Categorías' }],
      },
    ];

    expect(buildNavItems(routes)).toEqual([
      { path: '/ajustes/categorias', label: 'Categorías', icon: undefined, section: undefined },
    ]);
  });

  it('las rutas hijas heredan el apartado declarado en data.section', () => {
    const routes: Routes = [
      { path: '', title: 'Resumen' },
      {
        path: 'configuracion',
        data: { section: 'Configuración' },
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'categorias' },
          { path: 'categorias', title: 'Categorías' },
          { path: 'otra', title: 'Otra', data: { section: 'Aparte' } },
        ],
      },
    ];

    expect(buildNavItems(routes).map(({ path, section }) => [path, section])).toEqual([
      ['/', undefined],
      ['/configuracion/categorias', 'Configuración'],
      ['/configuracion/otra', 'Aparte'],
    ]);
  });
});

describe('groupNavItems', () => {
  const item = (label: string, section?: string) => ({
    path: `/${label}`,
    label,
    icon: undefined,
    section,
  });

  it('agrupa por apartado en el orden en que aparece cada uno', () => {
    const sections = groupNavItems([
      item('a'),
      item('b', 'Configuración'),
      item('c'),
      item('d', 'Configuración'),
    ]);

    expect(sections.map((s) => [s.label, s.items.map((i) => i.label)])).toEqual([
      [undefined, ['a', 'c']],
      ['Configuración', ['b', 'd']],
    ]);
  });

  it('sin elementos no hay apartados', () => {
    expect(groupNavItems([])).toEqual([]);
  });
});
