import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SIDEBAR_STORAGE_KEY } from '@pages/shell/sidebar-state';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { inProcessDbWorker } from '../testing/in-process-db-worker';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker }],
    }).compileComponents();
  });

  /** La app, ya dentro: con una BD abierta (sin ella se ve la landing). */
  async function inside() {
    await TestBed.inject(DbService).openLocal();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture;
  }

  it('sin BD abierta enseña la landing y no la barra lateral (ADR-0029)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-landing-page')).not.toBeNull();
    expect(compiled.querySelector('mat-sidenav')).toBeNull();
  });

  it('al abrir una BD entra en la aplicación y al cerrarla vuelve a la landing', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const db = TestBed.inject(DbService);

    await db.openDemo();
    await fixture.whenStable();
    expect(compiled.querySelector('app-landing-page')).toBeNull();
    expect(compiled.querySelector('mat-sidenav app-sidebar')).not.toBeNull();

    db.close();
    await fixture.whenStable();
    expect(compiled.querySelector('app-landing-page')).not.toBeNull();
  });

  it('se crea', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('muestra el título de la aplicación', async () => {
    const fixture = await inside();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('AstroFinance');
  });

  it('incluye la barra lateral con la navegación', async () => {
    const fixture = await inside();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-sidenav app-sidebar nav')).not.toBeNull();
  });

  it('pone los accesos rápidos de la copia en la barra lateral', async () => {
    const fixture = await inside();
    const group = (fixture.nativeElement as HTMLElement).querySelector(
      'app-sidebar [role="group"]',
    );
    const labels = [...(group?.querySelectorAll('button') ?? [])].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Descargar una copia', 'Cargar una copia', 'Modo oscuro', 'Idioma']);
  });

  describe('barra lateral plegable', () => {
    afterEach(() => localStorage.removeItem(SIDEBAR_STORAGE_KEY));

    it('en escritorio se pliega y se despliega con su botón, y lo recuerda', async () => {
      const fixture = await inside();
      const element = fixture.nativeElement as HTMLElement;
      const toggle = () => element.querySelector<HTMLButtonElement>('button.collapse-toggle');

      toggle()?.click();
      await fixture.whenStable();
      expect(element.querySelector('mat-sidenav')?.classList.contains('collapsed')).toBe(true);
      expect(element.querySelector('app-sidebar')?.classList.contains('collapsed')).toBe(true);
      expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('plegado');

      toggle()?.click();
      await fixture.whenStable();
      expect(element.querySelector('mat-sidenav')?.classList.contains('collapsed')).toBe(false);
    });
  });
});
