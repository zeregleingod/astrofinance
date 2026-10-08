import { Component, inject, input, resource } from '@angular/core';
import { TEXTS } from '@core/i18n/texts';
import { injectMonthSelection } from '@core/period/month-selection';
import { DbService } from '@data/db/db-service';
import { EmptyState } from '@shared/empty-state/empty-state';
import { CentsPipe } from '@shared/format/format-pipes';
import { MonthNav } from '@shared/month-nav/month-nav';

/** Resumen mensual con los bloques de la hoja de gastos: totales por grupo y subcategoría. */
@Component({
  selector: 'app-dashboard-page',
  imports: [CentsPipe, EmptyState, MonthNav],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);

  /** `?mes=AAAA-MM`. */
  readonly mes = input<string>();

  protected readonly selection = injectMonthSelection(this.mes);

  protected readonly report = resource({
    params: () => {
      const period = this.selection.period();
      return this.db.ready() && period ? { period, version: this.db.dataVersion() } : undefined;
    },
    loader: ({ params, abortSignal }) => this.db.monthReport(params.period, abortSignal),
  });
}
