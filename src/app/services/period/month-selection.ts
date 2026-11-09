import { type Signal, computed, inject, resource } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AccountSelection } from '@services/accounts/account-selection';
import { DbService } from '@services/db/db-service';
import { resolvePeriod } from '@domain/dates/period';

/**
 * Mes mostrado por una página: el de `?mes=AAAA-MM` si tiene datos o, si no, el más
 * reciente. Debe llamarse en un contexto de inyección (campo de un componente).
 */
export function injectMonthSelection(requested: Signal<string | undefined>) {
  const db = inject(DbService);
  const router = inject(Router);
  const route = inject(ActivatedRoute);
  const accounts = inject(AccountSelection);

  // Los meses de la cuenta elegida (ADR-0035); sin ninguna cuenta, ninguno.
  const periods = resource({
    params: () =>
      db.ready() && accounts.loaded()
        ? { version: db.dataVersion(), accountId: accounts.accountId() }
        : undefined,
    loader: ({ params, abortSignal }) =>
      params.accountId === null
        ? Promise.resolve<readonly string[]>([])
        : db.periods(params.accountId, abortSignal),
  });

  const available = computed(() => (periods.hasValue() ? periods.value() : []));
  const period = computed(() => resolvePeriod(requested(), available()));
  /** La BD está abierta pero la cuenta todavía no tiene ningún movimiento. */
  const empty = computed(() => periods.hasValue() && periods.value().length === 0);

  const select = (mes: string) =>
    router.navigate([], { relativeTo: route, queryParams: { mes }, queryParamsHandling: 'merge' });

  return { available, period, empty, select };
}
