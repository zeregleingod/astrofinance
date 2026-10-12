import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDrag, type CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@core/i18n/texts';
import { DbService } from '@data/db/db-service';
import {
  applyTransactionFilter,
  isFiltering,
  monthFilter,
  transactionFilterOptions,
  type TransactionFilter,
} from '@domain/reports/transaction-filter';
import type { TransactionRow } from '@domain/reports/transaction-row';
import {
  filterTransactions,
  nextSort,
  sortTransactions,
  transactionTags,
  type TableLabels,
  type TransactionSort,
  type TransactionSortKey,
} from '@domain/reports/transaction-table';
import { EmptyState } from '@shared/empty-state/empty-state';
import { CentsPipe } from '@shared/format/cents-pipe';
import { IsoDatePipe } from '@shared/format/iso-date-pipe';
import { TransactionFilters } from './transaction-filters';

interface Column {
  readonly key: TransactionSortKey;
  readonly label: string;
  readonly numeric?: boolean;
}

const t = TEXTS.transactions;

const LABELS: TableLabels = {
  shared: t.shared,
  reimbursement: t.reimbursement,
  transfer: t.transfer,
  installment: t.installment,
  uncategorized: TEXTS.dashboard.uncategorized,
};

/**
 * Lista de todos los movimientos, con filtros que se aplican al pulsar «Filtrar», búsqueda al
 * escribir y orden por columna.
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
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TransactionFilters,
  ],
  templateUrl: './transactions-page.html',
  styleUrl: './transactions-page.scss',
})
export class TransactionsPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);

  /** `?mes=AAAA-MM`: llegar con un mes equivale a filtrar por sus fechas. */
  readonly mes = input<string>();

  /** Filas que se pintan de entrada y cada vez que se pide ver más. */
  readonly pageSize = signal(200);

  /** El filtro aplicado; el formulario de filtros lo cambia al pulsar «Filtrar». */
  protected readonly filter = linkedSignal<TransactionFilter>(() => monthFilter(this.mes()));

  /** En el orden elegido por el usuario; se conserva al filtrar. */
  protected readonly columns = signal<readonly Column[]>([
    { key: 'bookedDate', label: t.bookedDate },
    { key: 'opDate', label: t.originalDate },
    { key: 'description', label: t.description },
    { key: 'tags', label: t.tags },
    { key: 'category', label: t.category },
    { key: 'subcategory', label: t.subcategory },
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

  protected readonly loaded = computed(() => this.all() !== undefined);
  protected readonly total = computed(() => this.all()?.length ?? 0);
  protected readonly options = computed(() => transactionFilterOptions(this.all() ?? []));

  /** Los que cumplen los filtros y la búsqueda, ya ordenados. */
  private readonly matching = computed(() => {
    const filtered = applyTransactionFilter(this.all() ?? [], this.filter());
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
      .map((row) => ({ ...row, tags: transactionTags(row, LABELS) })),
  );

  /** Movimientos que cumplen los filtros pero aún no se han pintado. */
  protected readonly remaining = computed(() => this.matching().length - this.rows().length);

  /** «40» o, con filtros o búsqueda, «12 de 40». */
  protected readonly count = computed(() =>
    this.query() || isFiltering(this.filter())
      ? `${this.matching().length} ${t.of} ${this.total()}`
      : String(this.total()),
  );

  /** Aplica los filtros elegidos y anuncia cuántos movimientos quedan. */
  protected applyFilter(filter: TransactionFilter): void {
    this.filter.set(filter);
    void this.announcer.announce(`${t.shown} ${this.matching().length}`);
  }

  protected showMore(): void {
    this.limit.update((limit) => limit + this.pageSize());
  }

  protected sortBy(key: TransactionSortKey): void {
    this.sort.update((current) => nextSort(current, key));
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
