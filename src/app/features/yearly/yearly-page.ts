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
import { Viewport } from '@core/layout/viewport';
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
  /** En móvil la columna de categoría no cabe junto a los meses. */
  protected readonly compact = inject(Viewport).compact;

  /** `?anio=AAAA`. */
  readonly anio = input<string>();

  protected readonly selection = injectYearSelection(this.anio);

  constructor() {
    // Los meses se reparten lo que dejan las demás columnas, que tienen ancho fijo: la de
    // subcategoría, el del nombre más largo (en una línea, nunca se recorta). Se mide cada vez
    // que cambian los nombres y, otra vez, cuando la fuente está cargada. En móvil los nombres
    // saltan de línea y el ancho lo fija la hoja de estilos.
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterRenderEffect(() => {
      this.sections();
      if (this.compact()) {
        host.style.removeProperty('--line-content-width');
        return;
      }
      measureLineWidth(host);
      void host.ownerDocument.fonts?.ready.then(() => {
        if (!this.compact()) measureLineWidth(host);
      });
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
      short: TEXTS.period.monthsShort[i],
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

/** Fija `--line-content-width` al ancho del nombre de subcategoría más largo de la hoja. */
function measureLineWidth(host: HTMLElement): void {
  const view = host.ownerDocument.defaultView;
  if (!view) return;
  const widths = [...host.querySelectorAll<HTMLElement>('tbody th.line-col')].map((cell) => {
    // Del punto de color al final del nombre: el tinte de la fila ocupa toda la celda.
    const dot = cell.querySelector('.dot');
    const last = cell.lastChild;
    if (!dot || !last) return 0;
    const range = host.ownerDocument.createRange();
    // Sin maquetación (p. ej. en los tests) no hay nada que medir.
    if (typeof range.getBoundingClientRect !== 'function') return 0;
    range.setStartBefore(dot);
    range.setEndAfter(last);
    const style = view.getComputedStyle(cell);
    return (
      range.getBoundingClientRect().width +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight)
    );
  });
  if (widths.length > 0) {
    host.style.setProperty('--line-content-width', `${Math.ceil(Math.max(...widths))}px`);
  }
}
