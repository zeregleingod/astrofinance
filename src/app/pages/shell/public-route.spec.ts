import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PublicRoute, isPublicUrl } from './public-route';

describe('isPublicUrl (ADR-0032)', () => {
  it('la privacidad es pública, con o sin consulta, fragmento o barra final', () => {
    expect(isPublicUrl('/privacidad')).toBe(true);
    expect(isPublicUrl('/privacidad/')).toBe(true);
    expect(isPublicUrl('/privacidad?x=1')).toBe(true);
    expect(isPublicUrl('/privacidad#alojamiento')).toBe(true);
  });

  it('el resto de páginas no lo son', () => {
    expect(isPublicUrl('/')).toBe(false);
    expect(isPublicUrl('/movimientos')).toBe(false);
    expect(isPublicUrl('/privacidad-extra')).toBe(false);
    expect(isPublicUrl('/configuracion/privacidad')).toBe(false);
  });
});

describe('PublicRoute', () => {
  it('sigue a la navegación', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'privacidad', children: [] },
          { path: 'movimientos', children: [] },
        ]),
      ],
    });
    const route = TestBed.inject(PublicRoute);
    const router = TestBed.inject(Router);
    expect(route.active()).toBe(false);

    await router.navigateByUrl('/privacidad');
    expect(route.active()).toBe(true);

    await router.navigateByUrl('/movimientos');
    expect(route.active()).toBe(false);
  });
});
