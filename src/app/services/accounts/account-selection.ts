import { DOCUMENT, Service, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { resolveAccount, type AccountRow } from '@domain/accounts/account';
import { DbService } from '@services/db/db-service';

/**
 * Clave de `sessionStorage` con la cuenta elegida: solo su id, sin datos financieros. Dura lo que
 * la pestaña, como la sesión de la BD (ADR-0031).
 */
export const ACCOUNT_STORAGE_KEY = 'astrofinance.cuenta';

/**
 * La cuenta con la que se trabaja (ADR-0035): el resumen, los movimientos, la hoja anual y la
 * importación son siempre de ella. Se elige en la barra lateral (o al importar) y se recuerda en
 * la pestaña. Si la elegida ya no existe (otra BD, la demo, se ha eliminado), es la primera.
 */
@Service()
export class AccountSelection {
  private readonly db = inject(DbService);
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private readonly requested = signal<number | null>(this.read());

  private readonly list = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => this.db.accounts(abortSignal),
  });

  /**
   * La última lista leída. Se conserva mientras se vuelve a leer tras un cambio, para que la
   * cuenta no desaparezca un instante; al cerrar la BD se olvida.
   */
  private readonly latest = linkedSignal<
    { readonly ready: boolean; readonly value: readonly AccountRow[] | undefined },
    readonly AccountRow[] | undefined
  >({
    source: () => ({
      ready: this.db.ready(),
      value: this.list.hasValue() ? this.list.value() : undefined,
    }),
    computation: (source, previous) =>
      source.ready ? (source.value ?? previous?.value) : undefined,
  });

  /** Las cuentas de la BD abierta, por nombre. */
  readonly accounts = computed(() => this.latest() ?? []);
  /** Ya se sabe qué cuentas hay (aunque no haya ninguna). */
  readonly loaded = computed(() => this.latest() !== undefined);
  /** La cuenta elegida; `null` si no hay ninguna. */
  readonly account = computed(() => resolveAccount(this.requested(), this.accounts()));
  readonly accountId = computed(() => this.account()?.id ?? null);

  select(id: number): void {
    this.requested.set(id);
    try {
      this.storage?.setItem(ACCOUNT_STORAGE_KEY, String(id));
    } catch {
      // Almacenamiento bloqueado: la elección vale mientras no se recargue.
    }
  }

  private read(): number | null {
    try {
      const id = Number(this.storage?.getItem(ACCOUNT_STORAGE_KEY));
      return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch {
      return null;
    }
  }
}
