import { Service, computed, inject, signal } from '@angular/core';
import { DbService } from '@services/db/db-service';

/** Cómo se entra desde la landing. */
export type LandingEntry = 'archivo' | 'demo' | 'vacia';

/**
 * Decide si se ve la landing o la aplicación (ADR-0029). Se entra cuando hay una BD abierta y la
 * landing ha terminado de abrirla: cargar un fichero abre antes una BD vacía para comprobarlo, y
 * esa no debe asomar si el fichero no vale. Sin BD (al empezar, al salir de la demo o si falla)
 * se vuelve a la landing.
 */
@Service()
export class LandingGate {
  private readonly db = inject(DbService);
  private readonly enteringState = signal<LandingEntry | null>(null);

  /** Lo que se está abriendo desde la landing. */
  readonly entering = this.enteringState.asReadonly();
  readonly inside = computed(() => this.db.ready() && this.enteringState() === null);

  /** Abre con `open` y, si va bien, entra. Mientras tanto se sigue viendo la landing. */
  async enter(entry: LandingEntry, open: () => Promise<void>): Promise<void> {
    if (this.enteringState() !== null) return;
    this.enteringState.set(entry);
    try {
      await open();
    } finally {
      this.enteringState.set(null);
    }
  }
}
