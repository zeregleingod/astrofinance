import { BreakpointObserver } from '@angular/cdk/layout';
import { Service, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/**
 * Por debajo de este ancho la barra lateral pasa a ser un panel desplegable y las tablas anchas
 * se ven como listas de tarjetas. Las hojas de estilo usan el mismo corte: `(width < 840px)`.
 */
export const COMPACT_QUERY = '(max-width: 839.98px)';

/** Desde este ancho cabe entera, junto a la barra lateral, la tabla de movimientos. */
export const WIDE_QUERY = '(min-width: 1280px)';

/** Tamaño de la ventana: si la app se ve en formato móvil o si caben las tablas anchas. */
@Service()
export class Viewport {
  private readonly breakpoints = inject(BreakpointObserver);

  readonly compact = this.matches(COMPACT_QUERY);
  readonly wide = this.matches(WIDE_QUERY);

  private matches(query: string) {
    return toSignal(this.breakpoints.observe(query).pipe(map((state) => state.matches)), {
      initialValue: false,
    });
  }
}
