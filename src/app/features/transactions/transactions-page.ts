import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDrag, type CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@core/i18n/texts';
import { Viewport } from '@core/layout/viewport';
import { DbService } from '@data/db/db-service';
import {
  summaryOrigin,
  type SummaryOrigin,
  type SummaryTotal,
} from '@domain/reports/summary-origin';
import {
  applyTransactionFilter,
  isFiltering,
  monthFilter,
  NO_FILTER,
  transactionFilterOptions,
  type TransactionFilter,
} from '@domain/reports/transaction-filter';
import { canSplit, type TransactionRow } from '@domain/reports/transaction-row';
import {
  filterTransactions,
  linkDescriptions,
  linkedIds,
  nextSort,
  sortTransactions,
  transactionTags,
  type LinkLabels,
  type TableLabels,
  type TransactionSort,
  type TransactionSortKey,
} from '@domain/reports/transaction-table';
import { EmptyState } from '@shared/empty-state/empty-state';
import { CentsPipe } from '@shared/format/cents-pipe';
import { IsoDatePipe } from '@shared/format/iso-date-pipe';
import { PeriodLabelPipe } from '@shared/format/period-label-pipe';
import { TransactionCards } from './transaction-cards';
import { TransactionEditDialog, type TransactionEditData } from './transaction-edit-dialog';
import { TransactionFilters } from './transaction-filters';
import { TransactionRefundDialog, type TransactionRefundData } from './transaction-refund-dialog';
import { TransactionSplitDialog, type TransactionSplitData } from './transaction-split-dialog';

/** Tabla de una línea por movimiento o una ficha por movimiento con todo a la vista. */
type Density = 'compact' | 'detailed';

interface Column {
  readonly key: TransactionSortKey;
  readonly label: string;
  readonly numeric?: boolean;
}

const t = TEXTS.transactions;

/** El nombre de cada total del resumen, como se ve en él. */
const SUMMARY_TOTAL_NAMES: Record<SummaryTotal, string> = {
  ingresos: TEXTS.dashboard.income,
  gastos: TEXTS.dashboard.expense,
  ahorro: TEXTS.dashboard.savings,
  balance: TEXTS.dashboard.balance,
  pendiente: TEXTS.dashboard.pending,
};

const LABELS: TableLabels = {
  shared: t.shared,
  reimbursement: t.reimbursement,
  transfer: t.transfer,
  installment: t.installment,
  split: t.split,
  uncategorized: TEXTS.dashboard.uncategorized,
};

const LINK_LABELS: LinkLabels = {
  refundedBy: t.links.refundedBy,
  refunds: t.links.refunds,
  transfer: t.links.transfer,
};

/**
 * Lista de todos los movimientos, con filtros que se aplican al pulsar «Filtrar», búsqueda al
 * escribir y orden por columna. Cada movimiento se edita en un diálogo (T5.2, ADR-0016) y se
 * puede dividir en submovimientos, que se ven debajo de él (ADR-0019). A un gasto se le vinculan
 * los ingresos que lo devuelven, que también se ven debajo (ADR-0021). Desde un movimiento
 * vinculado se ven solo él y los vinculados con él (ADR-0022).
 */
@Component({
  selector: 'app-transactions-page',
  imports: [
    CdkDrag,
    CdkDropList,
    CentsPipe,
    EmptyState,
    IsoDatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    NgTemplateOutlet,
    PeriodLabelPipe,
    TransactionCards,
    TransactionFilters,
  ],
  templateUrl: './transactions-page.html',
  styleUrl: './transactions-page.scss',
})
export class TransactionsPage {
  protected readonly texts = TEXTS;
  protected readonly canSplit = canSplit;
  protected readonly db = inject(DbService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  private readonly dialog = inject(MatDialog);

  /** Si no cabe la tabla, tarjetas; en móvil, además, los filtros plegados. */
  protected readonly viewport = inject(Viewport);
  protected readonly compact = this.viewport.compact;
  protected readonly filtersOpen = signal(false);

  /**
   * Con sitio para la tabla, el usuario elige entre ella y las fichas; siempre se empieza por la
   * compacta. Sin sitio, siempre fichas.
   */
  protected readonly density = signal<Density>('compact');
  protected readonly showTable = computed(
    () => this.viewport.wide() && this.density() === 'compact',
  );
  private readonly filtersToggle = viewChild('filtersToggle', { read: ElementRef });
  private readonly toolbar = viewChild('toolbar', { read: ElementRef });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // La cabecera de la tabla se queda fija justo debajo de la barra de búsqueda y filtros, cuyo
    // alto cambia cuando los filtros saltan de línea, se despliegan o explican un error.
    const host = this.host;
    effect((onCleanup) => {
      const toolbar = this.toolbar()?.nativeElement as HTMLElement | undefined;
      const view = host.ownerDocument.defaultView;
      if (!toolbar || !view || !('ResizeObserver' in view)) return;
      const observer = new view.ResizeObserver(() =>
        host.style.setProperty('--toolbar-height', `${toolbar.offsetHeight}px`),
      );
      observer.observe(toolbar);
      onCleanup(() => observer.disconnect());
    });
  }

  /** `?mes=AAAA-MM`: llegar con un mes equivale a filtrar por sus fechas. */
  readonly mes = input<string>();

  /**
   * `?origen=gastos` (con `?mes=`): llegar desde un total del resumen enseña los movimientos que
   * lo forman (ADR-0017). Sin acotar por fechas: hay Bizums que suman en el mes de su gasto.
   */
  readonly origen = input<string>();

  /** El total del resumen del que se viene; el usuario puede quitarlo. */
  protected readonly origin = linkedSignal<SummaryOrigin | null>(() =>
    summaryOrigin(this.mes(), this.origen()),
  );

  protected readonly originName = (total: SummaryTotal) => SUMMARY_TOTAL_NAMES[total];

  /**
   * El movimiento del que se enseñan solo él y sus vinculados (ADR-0022), por encima de los
   * filtros y la búsqueda; buscar, filtrar o cambiar de origen lo quita.
   */
  private readonly linkedTo = linkedSignal<unknown, number | null>({
    source: () => [this.query(), this.filter(), this.origin()],
    computation: () => null,
  });

  /** Filas que se pintan de entrada y cada vez que se pide ver más. */
  readonly pageSize = signal(200);

  /** El filtro aplicado; el formulario de filtros lo cambia al pulsar «Filtrar». */
  protected readonly filter = linkedSignal<TransactionFilter>(() =>
    summaryOrigin(this.mes(), this.origen()) ? NO_FILTER : monthFilter(this.mes()),
  );

  /** En el orden elegido por el usuario; se conserva al filtrar. */
  protected readonly columns = signal<readonly Column[]>([
    { key: 'bookedDate', label: t.bookedDate },
    { key: 'description', label: t.description },
    { key: 'tags', label: t.tags },
    { key: 'category', label: t.category },
    { key: 'account', label: t.account },
    { key: 'amount', label: t.amount, numeric: true },
    { key: 'notes', label: t.notes },
  ]);

  protected readonly query = signal('');
  protected readonly sort = signal<TransactionSort>({ key: 'bookedDate', direction: 'desc' });

  private readonly transactions = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => this.db.allTransactions(abortSignal),
  });

  /** Conserva la lista anterior mientras se recarga tras un cambio, para que no parpadee. */
  private readonly all = linkedSignal<
    readonly TransactionRow[] | undefined,
    readonly TransactionRow[] | undefined
  >({
    source: () => (this.transactions.hasValue() ? this.transactions.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });

  /** Los movimientos que forman el total del resumen del que se viene. */
  private readonly originIds = resource({
    params: () => {
      const origin = this.origin();
      return origin && this.db.ready() ? { origin, version: this.db.dataVersion() } : undefined;
    },
    loader: ({ params, abortSignal }) => this.db.summaryTransactionIds(params.origin, abortSignal),
  });

  /** Las subcategorías que se pueden asignar al editar un movimiento. */
  private readonly categories = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => this.db.categoryOptions(abortSignal),
  });

  protected readonly loaded = computed(
    () => this.all() !== undefined && (this.origin() === null || this.originIds.hasValue()),
  );
  protected readonly total = computed(() => this.all()?.length ?? 0);
  protected readonly options = computed(() => transactionFilterOptions(this.all() ?? []));

  /** El movimiento de la vista de vinculados, ya recargado si ha cambiado. */
  protected readonly linkedRow = computed(() => {
    const id = this.linkedTo();
    return id === null ? null : (this.all()?.find((row) => row.id === id) ?? null);
  });

  /** Los que cumplen los filtros y la búsqueda (o los vinculados), ya ordenados. */
  private readonly matching = computed(() => {
    const linked = this.linkedRow();
    if (linked) {
      const shown = linkedIds(linked);
      const rows = (this.all() ?? []).filter((row) => shown.has(row.id));
      return sortTransactions(rows, this.sort(), LABELS);
    }
    const ids = this.origin() && this.originIds.hasValue() ? new Set(this.originIds.value()) : null;
    const all = this.all() ?? [];
    const fromOrigin = this.origin() ? all.filter((row) => ids?.has(row.id)) : all;
    const filtered = applyTransactionFilter(fromOrigin, this.filter());
    const visible = filterTransactions(filtered, this.query(), LABELS);
    return sortTransactions(visible, this.sort(), LABELS);
  });

  /** Cuántas filas se pintan; vuelve al principio al cambiar los filtros, la búsqueda o el orden. */
  private readonly limit = linkedSignal<readonly TransactionRow[], number>({
    source: () => this.matching(),
    computation: () => this.pageSize(),
  });

  protected readonly rows = computed(() =>
    this.matching()
      .slice(0, this.limit())
      .map((row) => ({
        ...row,
        tags: transactionTags(row, LABELS),
        linkTexts: linkDescriptions(row, LINK_LABELS),
      })),
  );

  /** Movimientos que cumplen los filtros pero aún no se han pintado. */
  protected readonly remaining = computed(() => this.matching().length - this.rows().length);

  protected readonly filtering = computed(
    () => this.linkedRow() !== null || this.origin() !== null || isFiltering(this.filter()),
  );

  /** «40» o, con filtros o búsqueda, «12 de 40». */
  protected readonly count = computed(() =>
    this.query() || this.filtering()
      ? `${this.matching().length} ${t.of} ${this.total()}`
      : String(this.total()),
  );

  /** Aplica los filtros elegidos y anuncia cuántos movimientos quedan. */
  protected applyFilter(filter: TransactionFilter): void {
    this.filter.set(filter);
    void this.announcer.announce(`${t.shown} ${this.matching().length}`);
    // En móvil los filtros se pliegan para ver el resultado; el foco vuelve a su botón.
    if (this.compact() && this.filtersOpen()) {
      this.filtersOpen.set(false);
      this.filtersToggle()?.nativeElement.focus();
    }
  }

  /** Deja de acotar al total del resumen y anuncia cuántos movimientos quedan. */
  protected removeOrigin(): void {
    this.origin.set(null);
    void this.announcer.announce(`${t.origin.removed} ${this.matching().length}`);
  }

  /** Enseña solo el movimiento y los vinculados con él, y anuncia cuántos son. */
  protected showLinked(row: TransactionRow): void {
    this.linkedTo.set(row.id);
    void this.announcer.announce(`${t.links.shown} ${this.matching().length}`);
    this.focusLinkButton(row.id);
  }

  /** Vuelve a la lista de antes; el foco, al botón del movimiento del que se partió. */
  protected removeLinked(): void {
    const id = this.linkedTo();
    this.linkedTo.set(null);
    void this.announcer.announce(`${t.links.removed} ${this.matching().length}`);
    if (id !== null) this.focusLinkButton(id);
  }

  /** Al rehacer la lista el navegador puede quitarle el foco al botón: se le devuelve. */
  private focusLinkButton(id: number): void {
    afterNextRender(
      () => this.host.querySelector<HTMLElement>(`button.linked[data-id="${id}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  /** Abre el movimiento para editarlo; al guardar la lista se recarga sola. */
  protected edit(row: TransactionRow): void {
    this.dialog
      .open<TransactionEditDialog, TransactionEditData, boolean>(TransactionEditDialog, {
        data: {
          row,
          categories: this.categories.hasValue() ? this.categories.value() : [],
        },
        width: '560px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.announcer.announce(t.edit.saved);
      });
  }

  /** Abre el movimiento para dividirlo en submovimientos (ADR-0019). */
  protected split(row: TransactionRow): void {
    this.dialog
      .open<TransactionSplitDialog, TransactionSplitData, boolean>(TransactionSplitDialog, {
        data: {
          row,
          categories: this.categories.hasValue() ? this.categories.value() : [],
        },
        width: '760px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.announcer.announce(t.splits.saved);
      });
  }

  /** Abre el gasto para vincularle los ingresos que lo devuelven (ADR-0021). */
  protected refund(row: TransactionRow): void {
    this.dialog
      .open<TransactionRefundDialog, TransactionRefundData, boolean>(TransactionRefundDialog, {
        data: { row },
        width: '720px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) void this.announcer.announce(t.refunds.saved);
      });
  }

  /** «Principal › Subcategoría» entero, para el título de la celda que lo recorta. */
  protected place(where: Pick<TransactionRow, 'categoryName' | 'subcategoryName'>): string {
    if (where.categoryName === null) return TEXTS.dashboard.uncategorized;
    return [where.categoryName, where.subcategoryName].filter(Boolean).join(' › ');
  }

  protected showMore(): void {
    this.limit.update((limit) => limit + this.pageSize());
  }

  protected sortBy(key: TransactionSortKey): void {
    this.sort.update((current) => nextSort(current, key));
  }

  /** En móvil el orden se elige en un desplegable; se conserva la dirección. */
  protected sortByKey(key: string): void {
    const column = this.columns().find((candidate) => candidate.key === key);
    if (column) this.sort.update(({ direction }) => ({ key: column.key, direction }));
  }

  protected flipDirection(): void {
    this.sort.update(({ key, direction }) => ({
      key,
      direction: direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  protected dropColumn({ previousIndex, currentIndex }: CdkDragDrop<unknown>): void {
    this.moveColumn(previousIndex, currentIndex);
  }

  /** Alternativa de teclado al arrastre: Alt + flecha desplaza la columna una posición. */
  protected shiftColumn(index: number, delta: -1 | 1, event: Event): void {
    event.preventDefault();
    const moved = this.moveColumn(index, index + delta);
    if (!moved) return;
    void this.announcer.announce(
      `${moved.label}: ${t.columnPosition} ${index + delta + 1} ${t.of} ${this.columns().length}`,
    );
    // Al recolocar la cabecera en el DOM el navegador le quita el foco.
    const button = event.currentTarget;
    afterNextRender(
      () => {
        if (button instanceof HTMLElement) button.focus();
      },
      { injector: this.injector },
    );
  }

  private moveColumn(from: number, to: number): Column | undefined {
    const columns = [...this.columns()];
    if (from === to || to < 0 || to >= columns.length) return undefined;
    moveItemInArray(columns, from, to);
    this.columns.set(columns);
    return columns[to];
  }

  protected ariaSort(key: TransactionSortKey): 'ascending' | 'descending' | 'none' {
    const { key: active, direction } = this.sort();
    if (active !== key) return 'none';
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: TransactionSortKey): string {
    const { key: active, direction } = this.sort();
    if (active !== key) return 'swap_vert';
    return direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }
}
