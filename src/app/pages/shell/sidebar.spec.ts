import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ThemeService } from '@services/theme/theme-service';
import { language, setLanguage } from '@ui/texts';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
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

  it('no ofrece la demo: solo se abre desde la landing (ADR-0029)', async () => {
    const { fixture, element } = await setup();
    await TestBed.inject(DbService).openLocal();
    await fixture.whenStable();

    expect(element.querySelector('.footer')).toBeNull();
    expect(element.textContent).not.toContain('Ver la demo');
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

  describe('idioma', () => {
    afterEach(() => setLanguage('es'));

    it('el menú de idioma ofrece cada idioma y cambia los textos sin recargar', async () => {
      const { fixture, element } = await setup();
      const trigger = element.querySelector<HTMLButtonElement>('button[aria-label="Idioma"]');
      expect(trigger?.closest('[role="group"]')).not.toBeNull();

      trigger?.click();
      await fixture.whenStable();
      const options = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
      expect(options.map((option) => option.textContent?.trim())).toEqual([
        'Español',
        'English',
        'Català',
      ]);
      expect(options.map((option) => option.getAttribute('aria-checked'))).toEqual([
        'true',
        'false',
        'false',
      ]);

      options[1]?.click();
      await fixture.whenStable();

      expect(element.querySelector('button[aria-label="Language"]')).not.toBeNull();
      expect(element.querySelector('button[aria-label="Dark mode"]')).not.toBeNull();
    });

    it('los apartados del menú que dan una función cambian con el idioma', async () => {
      TestBed.configureTestingModule({
        imports: [Sidebar],
        providers: [
          { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
          provideRouter([
            {
              path: 'x',
              data: { section: () => (language() === 'en' ? 'Settings' : 'Configuración') },
              children: [
                {
                  path: 'y',
                  title: () => (language() === 'en' ? 'Rules' : 'Reglas'),
                  children: [],
                },
              ],
            },
          ]),
        ],
      });
      const fixture = TestBed.createComponent(Sidebar);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      const text = () => element.querySelector('nav')?.textContent ?? '';
      expect(text()).toContain('Configuración');
      expect(text()).toContain('Reglas');

      setLanguage('en');
      await fixture.whenStable();

      expect(text()).toContain('Settings');
      expect(text()).toContain('Rules');
    });
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

    it('plegada conserva los enlaces con su nombre', async () => {
      const { element } = await collapsible(true);

      expect(element.classList.contains('collapsed')).toBe(true);
      const links = [...element.querySelectorAll('nav a')].map((a) =>
        a.querySelector('[matListItemTitle]')?.textContent?.trim(),
      );
      expect(links).toEqual(['Resumen', 'Movimientos', 'Categorías']);
      expect(element.querySelector('h1')?.textContent).toContain('AstroFinance');
    });
  });
});
