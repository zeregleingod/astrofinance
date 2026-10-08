import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([
          { path: '', title: 'Resumen', data: { icon: 'dashboard' }, children: [] },
          { path: 'movimientos', title: 'Movimientos', children: [] },
          { path: 'oculta', title: 'Oculta', data: { nav: false }, children: [] },
          { path: '**', redirectTo: '' },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(Sidebar);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('muestra el logo y el nombre de la aplicación', async () => {
    const { element } = await setup();

    expect(element.querySelector('img')?.getAttribute('src')).toBe('logo.svg');
    expect(element.querySelector('h1')?.textContent).toContain('AstroFinance');
  });

  it('genera un enlace por cada ruta navegable con su título', async () => {
    const { element } = await setup();

    const links = Array.from(element.querySelectorAll('nav a'));
    expect(links.map((a) => a.textContent?.replace('dashboard', '').trim())).toEqual([
      'Resumen',
      'Movimientos',
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/movimientos']);
  });

  it('marca la sección activa con aria-current', async () => {
    const { fixture, element } = await setup();

    await TestBed.inject(Router).navigateByUrl('/movimientos');
    await fixture.whenStable();

    const current = element.querySelector('nav a[aria-current="page"]');
    expect(current?.textContent).toContain('Movimientos');
  });

  it('emite navigate al pulsar un enlace', async () => {
    const { fixture, element } = await setup();
    const spy = vi.fn();
    fixture.componentInstance.navigate.subscribe(spy);

    element.querySelector<HTMLAnchorElement>('nav a')?.click();

    expect(spy).toHaveBeenCalled();
  });
});
