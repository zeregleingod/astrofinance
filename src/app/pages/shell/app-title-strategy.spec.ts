import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { DB_WORKER_FACTORY, DbService } from '@services/db/db-service';
import { language, setLanguage } from '@ui/texts';
import { inProcessDbWorker } from '../../../testing/in-process-db-worker';
import { AppTitleStrategy } from './app-title-strategy';

describe('AppTitleStrategy', () => {
  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'seccion', title: 'Resumen', children: [] },
          { path: 'sin-titulo', children: [] },
          { path: 'privacidad', title: 'Privacidad', children: [] },
          {
            path: 'traducida',
            title: () => (language() === 'en' ? 'Overview' : 'Resumen'),
            children: [],
          },
        ]),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
        { provide: DB_WORKER_FACTORY, useValue: inProcessDbWorker },
      ],
    });
    // Dentro de la aplicación: con una BD abierta.
    await TestBed.inject(DbService).openLocal();
  });

  it('compone el título de la sección con el nombre de la aplicación', async () => {
    await TestBed.inject(Router).navigateByUrl('/seccion');

    expect(TestBed.inject(Title).getTitle()).toBe('Resumen · AstroFinance');
  });

  it('usa solo el nombre de la aplicación si la ruta no tiene título', async () => {
    await TestBed.inject(Router).navigateByUrl('/sin-titulo');

    expect(TestBed.inject(Title).getTitle()).toBe('AstroFinance');
  });

  it('vuelve a escribir el título al cambiar de idioma', async () => {
    await TestBed.inject(Router).navigateByUrl('/traducida');
    expect(TestBed.inject(Title).getTitle()).toBe('Resumen · AstroFinance');

    setLanguage('en');
    TestBed.tick();

    expect(TestBed.inject(Title).getTitle()).toBe('Overview · AstroFinance');
    setLanguage('es');
  });

  it('en la landing, sin BD abierta, solo el nombre de la aplicación (ADR-0029)', async () => {
    await TestBed.inject(Router).navigateByUrl('/seccion');
    const db = TestBed.inject(DbService);

    db.close();
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('AstroFinance');

    await db.openDemo();
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Resumen · AstroFinance');
  });

  it('sin BD, una página pública conserva su título (ADR-0032)', async () => {
    TestBed.inject(DbService).close();
    await TestBed.inject(Router).navigateByUrl('/privacidad');

    expect(TestBed.inject(Title).getTitle()).toBe('Privacidad · AstroFinance');
  });
});
