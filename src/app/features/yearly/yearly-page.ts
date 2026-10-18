import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  resource,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';
import { injectYearSelection } from '@core/period/year-selection';
import { DbService } from '@data/db/db-service';
import type { MonthSeries, YearLine } from '@domain/reports/year-report';
import { EmptyState } from '@shared/empty-state/empty-state';
import { CentsPipe } from '@shared/format/cents-pipe';
import { YearNav } from '@shared/year-nav/year-nav';

/** Un bloque de la tabla: la categoría (celda que abarca sus filas) y sus subcategorías. */
interface Section {
  readonly key: string;
  readonly name: string;
  readonly color: string | null;
  readonly totalCents: number;
  /** Ingresos y ahorro van teñidos de lado a lado; los gastos, solo en su categoría. */
  readonly tinted: boolean;
  readonly rows: readonly YearLine[];
}

interface FooterRow {
  readonly label: string;
  readonly series: MonthSeries;
  /** Los gastos van en rojo; el balance, resaltado. */
  readonly kind: 'expense' | 'balance';
}

/**
 * Hoja anual, como la de la hoja de cálculo: una fila por subcategoría agrupada bajo su
 * categoría, una columna por mes y el total del año.
 */
@Component({
  selector: 'app-yearly-page',
  imports: [CentsPipe, EmptyState, NgTemplateOutlet, RouterLink, YearNav],
  templateUrl: './yearly-page.html',
  styleUrl: './yearly-page.scss',
})
export class YearlyPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);

  /** `?anio=AAAA`. */
  readonly anio = input<string>();

  protected readonly selection = injectYearSelection(this.anio);

  constructor() {
    // La columna de subcategoría se queda fija justo a la derecha de la de categoría, cuyo
    // ancho depende de los nombres: se mide cada vez que cambian.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterRenderEffect(() => {
      this.sections();
      const column = host.querySelector('thead .group-col');
      if (column) {
        host.style.setProperty('--group-width', `${column.getBoundingClientRect().width}px`);
      }
    });
  }

  protected readonly report = resource({
    params: () => {
      const year = this.selection.year();
      return this.db.ready() && year !== undefined
        ? { year, version: this.db.dataVersion() }
        : undefined;
    },
    loader: ({ params, abortSignal }) => this.db.yearReport(params.year, abortSignal),
  });

  protected readonly columns = computed(() => {
    const report = this.report.value();
    return TEXTS.period.months.map((name, i) => ({
      name,
      // Solo los meses con movimientos enlazan a su resumen mensual.
      period:
        report?.monthsWithData[i] === true
          ? `${report.year}-${String(i + 1).padStart(2, '0')}`
          : undefined,
    }));
  });

  protected readonly sections = computed((): Section[] => {
    const report = this.report.value();
    if (!report) return [];
    const sections = report.groups.map((group) => ({
      key: `g${group.id}`,
      name: group.name,
      color: group.color,
      totalCents: group.totalCents,
      tinted: group.kind === 'ingreso' || group.kind === 'ahorro',
      // Un grupo sin subcategorías se enseña con su propia fila.
      rows: group.lines.length > 0 ? group.lines : [group],
    }));
    const none = report.uncategorized;
    if (none.count === 0) return sections;
    const line: YearLine = { ...none, id: 0, name: TEXTS.yearly.uncategorized, color: null };
    return [
      ...sections,
      {
        key: 'none',
        name: line.name,
        color: null,
        totalCents: none.totalCents,
        tinted: false,
        rows: [line],
      },
    ];
  });

  protected readonly footer = computed((): FooterRow[] => {
    const report = this.report.value();
    if (!report) return [];
    return [
      { label: TEXTS.yearly.expenseTotal, series: report.expense, kind: 'expense' },
      { label: TEXTS.yearly.balance, series: report.balanceWithoutSavings, kind: 'balance' },
    ];
  });
}
