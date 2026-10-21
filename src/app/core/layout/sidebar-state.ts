import { DOCUMENT, Service, inject, signal } from '@angular/core';

/** Clave de `localStorage` con la preferencia del menú (no contiene datos financieros). */
export const SIDEBAR_STORAGE_KEY = 'astrofinance.sidebar';

/**
 * Si la barra lateral de escritorio está plegada (solo iconos) o desplegada. La elección se
 * recuerda; si el navegador no deja guardarla, vale para esta sesión.
 */
@Service()
export class SidebarState {
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;
  private readonly collapsedState = signal(this.read());

  readonly collapsed = this.collapsedState.asReadonly();

  toggle(): void {
    const collapsed = !this.collapsedState();
    this.collapsedState.set(collapsed);
    try {
      this.storage?.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'plegado' : 'desplegado');
    } catch {
      // Almacenamiento bloqueado: el cambio vale solo para esta sesión.
    }
  }

  private read(): boolean {
    try {
      return this.storage?.getItem(SIDEBAR_STORAGE_KEY) === 'plegado';
    } catch {
      return false;
    }
  }
}
