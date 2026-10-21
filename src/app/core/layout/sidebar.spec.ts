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
          {
            path: 'configuracion',
            data: { section: 'Configuración' },
            children: [{ path: 'categorias', title: 'Categorías', children: [] }],
          },
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
      'Categorías',
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/movimientos',
      '/configuracion/categorias',
    ]);
  });

  it('agrupa los enlaces en apartados con su rótulo', async () => {
    const { element } = await setup();

    const labels = Array.from(element.querySelectorAll('.section-label'));
    expect(labels.map((p) => p.textContent.trim())).toEqual(['Menú', 'Configuración']);
    const lists = Array.from(element.querySelectorAll('mat-nav-list'));
    expect(lists.map((list) => list.getAttribute('aria-label'))).toEqual(['Menú', 'Configuración']);
    expect(lists[1]?.querySelectorAll('a')).toHaveLength(1);
    expect(lists[1]?.textContent).toContain('Categorías');
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

  it('ofrece ver la demo al pie y lo oculta dentro de ella', async () => {
    const { fixture, element } = await setup();
    const demo = element.querySelector<HTMLAnchorElement>('.footer a[href="/demo"]');

    expect(demo?.textContent).toContain('Ver la demo');

    await TestBed.inject(DbService).openDemo();
    await fixture.whenStable();
    expect(element.querySelector('a[href="/demo"]')).toBeNull();
  });

  it('dentro de la demo, en el sitio del botón, avisa del modo demo y permite salir', async () => {
    const { fixture, element } = await setup();
    const db = TestBed.inject(DbService);
    const navigate = vi.fn();
    fixture.componentRef.instance.navigate.subscribe(navigate);
    await db.openDemo();
    await fixture.whenStable();

    const notice = element.querySelector('.footer [role="status"]');
    expect(notice?.textContent).toContain('Modo demo: datos ficticios que no se guardan.');

    const exit = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Salir de la demo'),
    );
    exit?.click();
    await fixture.whenStable();
    expect(db.mode()).toBeNull();
    expect(navigate).toHaveBeenCalled();
    expect(element.querySelector('.footer [role="status"]')).toBeNull();
    expect(element.querySelector('a[href="/demo"]')).not.toBeNull();
  });

  it('sigue ofreciendo la demo con la BD del usuario abierta, hasta que tiene algo suyo', async () => {
    const { fixture, element } = await setup();
    const db = TestBed.inject(DbService);

    // Abrirla (p. ej. al entrar en Categorías) solo carga la plantilla.
    await db.openLocal();
    await fixture.whenStable();
    expect(element.querySelector('a[href="/demo"]')).not.toBeNull();

    await db.createCategory({ parentId: null, name: 'Mascotas', color: null });
    await fixture.whenStable();
    expect(element.querySelector('a[href="/demo"]')).toBeNull();
  });

  it('muestra los accesos rápidos entre el logo y el menú', async () => {
    const { element } = await setup();

    const group = element.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('Accesos rápidos');
    expect(group?.previousElementSibling?.tagName.toLowerCase()).toBe('header');
    expect(group?.nextElementSibling?.tagName.toLowerCase()).toBe('nav');
  });

  it('el botón de modo oscuro cambia el tema y su icono (sol en claro, luna en oscuro)', async () => {
    const { fixture, element } = await setup();
    const theme = TestBed.inject(ThemeService);
    theme.set('light');
    await fixture.whenStable();

    const button = element.querySelector<HTMLButtonElement>('button[aria-label="Modo oscuro"]');
    const icon = () => button?.querySelector('mat-icon')?.getAttribute('fonticon');
    expect(button?.closest('[role="group"]')).not.toBeNull();
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(icon()).toBe('light_mode');

    button?.click();
    await fixture.whenStable();

    expect(theme.isDark()).toBe(true);
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(icon()).toBe('dark_mode');
  });

  describe('plegada', () => {
    async function collapsible(collapsed: boolean) {
      const page = await setup();
      page.fixture.componentRef.setInput('collapsible', true);
      page.fixture.componentRef.setInput('collapsed', collapsed);
      await page.fixture.whenStable();
      return page;
    }
    const toggle = (element: HTMLElement) =>
      element.querySelector<HTMLButtonElement>('button.collapse-toggle');

    it('sin `collapsible` no ofrece plegarse (móvil)', async () => {
      const { element } = await setup();
      expect(toggle(element)).toBeNull();
    });

    it('el botón dice qué hace, si está desplegada y lo pide al pulsarlo', async () => {
      const { fixture, element } = await collapsible(false);
      const spy = vi.fn();
      fixture.componentInstance.collapseToggle.subscribe(spy);

      expect(toggle(element)?.getAttribute('aria-label')).toBe('Plegar menú');
      expect(toggle(element)?.getAttribute('aria-expanded')).toBe('true');
      expect(toggle(element)?.getAttribute('aria-controls')).toBe('main-nav');
      toggle(element)?.click();
      expect(spy).toHaveBeenCalledTimes(1);

      fixture.componentRef.setInput('collapsed', true);
      await fixture.whenStable();
      expect(toggle(element)?.getAttribute('aria-label')).toBe('Desplegar menú');
      expect(toggle(element)?.getAttribute('aria-expanded')).toBe('false');
    });

    it('plegada conserva los enlaces con su nombre y ofrece la demo con un icono', async () => {
      const { element } = await collapsible(true);

      expect(element.classList.contains('collapsed')).toBe(true);
      const links = [...element.querySelectorAll('nav a')].map((a) =>
        a.querySelector('[matListItemTitle]')?.textContent?.trim(),
      );
      expect(links).toEqual(['Resumen', 'Movimientos', 'Categorías']);
      expect(element.querySelector('h1')?.textContent).toContain('AstroFinance');
      const demo = element.querySelector('a[href="/demo"]');
      expect(demo?.getAttribute('aria-label')).toBe('Ver la demo');
      expect(demo?.textContent?.trim()).toBe('science');
    });
  });
});
