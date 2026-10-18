import { type Signal, computed, inject, resource } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbService } from '@data/db/db-service';
import { periodYears, resolveYear } from '@domain/dates/period';

/**
 * Año mostrado por una página: el de `?anio=AAAA` si tiene datos o, si no, el más
 * reciente. Debe llamarse en un contexto de inyección (campo de un componente).
 */
export function injectYearSelection(requested: Signal<string | undefined>) {
  const db = inject(DbService);
  const router = inject(Router);
  const route = inject(ActivatedRoute);

  const periods = resource({
    params: () => (db.ready() ? { version: db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => db.periods(abortSignal),
  });

  const periodList = computed(() => (periods.hasValue() ? periods.value() : []));
  const available = computed(() => periodYears(periodList()));
  const year = computed(() => resolveYear(requested(), available()));
  /** La BD está abierta pero todavía no tiene ningún movimiento. */
  const empty = computed(() => periods.hasValue() && periods.value().length === 0);

  const select = (anio: number) =>
    router.navigate([], {
      relativeTo: route,
      queryParams: { anio },
      queryParamsHandling: 'merge',
    });

  return { available, year, empty, select };
}
