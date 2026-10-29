import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { AppTitleStrategy } from './app-title-strategy';

describe('AppTitleStrategy', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'seccion', title: 'Resumen', children: [] },
          { path: 'sin-titulo', children: [] },
        ]),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
  });

  it('compone el título de la sección con el nombre de la aplicación', async () => {
    await TestBed.inject(Router).navigateByUrl('/seccion');

    expect(TestBed.inject(Title).getTitle()).toBe('Resumen · AstroFinance');
  });

  it('usa solo el nombre de la aplicación si la ruta no tiene título', async () => {
    await TestBed.inject(Router).navigateByUrl('/sin-titulo');

    expect(TestBed.inject(Title).getTitle()).toBe('AstroFinance');
  });
});
