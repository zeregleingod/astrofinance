import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ThemeService } from '@core/theme/theme-service';
import { DB_WORKER_FACTORY, DbService } from '@data/db/db-service';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
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

  it('ofrece ver la demo justo encima del modo oscuro y lo oculta dentro de ella', async () => {
    const { fixture, element } = await setup();
    const footer = element.querySelector('.footer');
    const demo = footer?.querySelector<HTMLAnchorElement>('a[href="/demo"]');

    expect(demo?.textContent).toContain('Ver la demo');
    expect(demo?.nextElementSibling?.tagName.toLowerCase()).toBe('mat-slide-toggle');

    await TestBed.inject(DbService).openDemo();
    await fixture.whenStable();
    expect(element.querySelector('a[href="/demo"]')).toBeNull();
  });

  it('el interruptor de modo oscuro cambia el tema con un clic', async () => {
    const { fixture, element } = await setup();
    const theme = TestBed.inject(ThemeService);
    theme.set('light');
    await fixture.whenStable();

    const toggle = element.querySelector<HTMLButtonElement>('button[role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(element.textContent).toContain('Modo oscuro');

    toggle?.click();
    await fixture.whenStable();

    expect(theme.isDark()).toBe(true);
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
  });
});
