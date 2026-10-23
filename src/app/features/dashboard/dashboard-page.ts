import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TEXTS } from '@core/i18n/texts';
import { injectMonthSelection } from '@core/period/month-selection';
import { DbService } from '@data/db/db-service';
import { EmptyState } from '@shared/empty-state/empty-state';
import { CentsPipe } from '@shared/format/cents-pipe';
import type { CategoryGroup } from '@domain/reports/month-report';
import { MonthNav } from '@shared/month-nav/month-nav';
import { cardLayout } from './card-layout';
import { MovementList } from './movement-list';

/** Una tarjeta del Resumen: una categoría o lo que no tiene categoría. */
type DashboardCard =
  { readonly kind: 'group'; readonly group: CategoryGroup } | { readonly kind: 'uncategorized' };

type FoldStep = 'plegar-todo' | 'abrir-categorias' | 'abrir-todo';

/** Texto e icono del botón de plegar según lo que hará al pulsarlo. */
const FOLD_BUTTON: Record<FoldStep, { readonly label: string; readonly icon: string }> = {
  'plegar-todo': { label: TEXTS.dashboard.collapseAll, icon: 'unfold_less' },
  'abrir-categorias': { label: TEXTS.dashboard.expandGroups, icon: 'unfold_more' },
  'abrir-todo': { label: TEXTS.dashboard.expandAll, icon: 'unfold_more_double' },
};

/**
 * Resumen mensual con los bloques de la hoja de gastos: totales por grupo y subcategoría, y los
 * movimientos de cada subcategoría.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    CentsPipe,
    EmptyState,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MonthNav,
    MovementList,
    NgTemplateOutlet,
    RouterLink,
  ],
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

  /**
   * Las tarjetas en orden (las categorías y, al final, lo que no tiene categoría si hay algo),
   * repartidas por columnas de tres; las que no caben van debajo, de tres en tres por fila.
   */
  protected readonly layout = computed(() => {
    const report = this.report.value();
    if (!report) return cardLayout<DashboardCard>([]);
    const cards: DashboardCard[] = report.groups.map((group) => ({ kind: 'group', group }));
    if (report.uncategorized.count > 0) cards.push({ kind: 'uncategorized' });
    return cardLayout(cards);
  });

  /**
   * Bloques plegados: `g<id>` para una categoría (`g-none`, lo que no tiene) y `l<id>` para los
   * movimientos de una subcategoría. Por id, así que se mantienen al cambiar de mes.
   */
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());

  /** Las categorías que se pueden plegar en el mes a la vista. */
  private readonly groupKeys = computed(() => {
    const report = this.report.value();
    if (!report) return [];
    const keys = report.groups.map((group) => `g${group.id}`);
    return report.uncategorized.count > 0 ? [...keys, 'g-none'] : keys;
  });

  /** Las subcategorías con movimientos (las demás no tienen nada que plegar). */
  private readonly lineKeys = computed(
    () =>
      this.report
        .value()
        ?.groups.flatMap((group) => group.lines)
        .filter((line) => line.movements.length > 0)
        .map((line) => `l${line.id}`) ?? [],
  );

  /**
   * El botón de plegar va de menos a más: con todo abierto lo pliega todo; con todas las
   * categorías plegadas abre solo las categorías; en cualquier otro caso lo abre todo.
   */
  protected readonly foldButton = computed(() => FOLD_BUTTON[this.nextFold()]);

  private readonly nextFold = computed((): FoldStep => {
    const collapsed = this.collapsed();
    const groups = this.groupKeys();
    const all = [...groups, ...this.lineKeys()];
    if (!all.some((key) => collapsed.has(key))) return 'plegar-todo';
    if (groups.every((key) => collapsed.has(key))) return 'abrir-categorias';
    return 'abrir-todo';
  });

  protected isCollapsed(key: string): boolean {
    return this.collapsed().has(key);
  }

  protected toggle(key: string): void {
    this.collapsed.update((collapsed) => {
      const next = new Set(collapsed);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected foldStep(): void {
    switch (this.nextFold()) {
      case 'plegar-todo':
        this.collapsed.set(new Set([...this.groupKeys(), ...this.lineKeys()]));
        break;
      case 'abrir-categorias':
        this.collapsed.set(new Set(this.lineKeys()));
        break;
      case 'abrir-todo':
        this.collapsed.set(new Set());
    }
  }
}
