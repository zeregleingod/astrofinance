import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('se crea', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('muestra el título de la aplicación', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('AstroFinance');
  });

  it('incluye la barra lateral con la navegación', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-sidenav app-sidebar nav')).not.toBeNull();
  });

  it('pone los accesos rápidos de la copia en la barra lateral', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const group = (fixture.nativeElement as HTMLElement).querySelector(
      'app-sidebar [role="group"]',
    );
    const labels = [...(group?.querySelectorAll('button') ?? [])].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['Descargar una copia', 'Cargar una copia', 'Modo oscuro']);
  });
});
