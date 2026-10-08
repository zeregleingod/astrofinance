import { type Signal, computed, inject, resource } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbService } from '@data/db/db-service';
import { resolvePeriod } from '@domain/dates/period';

/**
 * Mes mostrado por una página: el de `?mes=AAAA-MM` si tiene datos o, si no, el más
 * reciente. Debe llamarse en un contexto de inyección (campo de un componente).
 */
export function injectMonthSelection(requested: Signal<string | undefined>) {
  const db = inject(DbService);
  const router = inject(Router);
  const route = inject(ActivatedRoute);

  const periods = resource({
    params: () => (db.ready() ? { version: db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => db.periods(abortSignal),
  });

  const available = computed(() => (periods.hasValue() ? periods.value() : []));
  const period = computed(() => resolvePeriod(requested(), available()));

  const select = (mes: string) =>
    router.navigate([], { relativeTo: route, queryParams: { mes }, queryParamsHandling: 'merge' });

  return { available, period, select };
}
