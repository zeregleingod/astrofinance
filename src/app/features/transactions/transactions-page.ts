import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@core/i18n/texts';
import { injectMonthSelection } from '@core/period/month-selection';
import { DbService } from '@data/db/db-service';
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
import { PeriodLabelPipe } from '@shared/format/period-label-pipe';
import { MonthNav } from '@shared/month-nav/month-nav';

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

/** Lista de los movimientos imputados a un mes, con búsqueda y orden por columna. */
@Component({
  selector: 'app-transactions-page',
  imports: [
    CentsPipe,
    EmptyState,
    IsoDatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MonthNav,
    PeriodLabelPipe,
  ],
  templateUrl: './transactions-page.html',
  styleUrl: './transactions-page.scss',
})
export class TransactionsPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);

  /** `?mes=AAAA-MM`. */
  readonly mes = input<string>();

  protected readonly selection = injectMonthSelection(this.mes);

  protected readonly columns: readonly Column[] = [
    { key: 'bookedDate', label: t.bookedDate },
    { key: 'opDate', label: t.originalDate },
    { key: 'description', label: t.description },
    { key: 'tags', label: t.tags },
    { key: 'category', label: t.category },
    { key: 'subcategory', label: t.subcategory },
    { key: 'account', label: t.account },
    { key: 'amount', label: t.amount, numeric: true },
    { key: 'notes', label: t.notes },
  ];

  protected readonly query = signal('');
  protected readonly sort = signal<TransactionSort>({ key: 'bookedDate', direction: 'desc' });

  private readonly transactions = resource({
    params: () => {
      const period = this.selection.period();
      return this.db.ready() && period ? { period, version: this.db.dataVersion() } : undefined;
    },
    loader: ({ params, abortSignal }) => this.db.transactions(params.period, abortSignal),
  });

  protected readonly total = computed(() =>
    this.transactions.hasValue() ? this.transactions.value().length : 0,
  );

  protected readonly rows = computed(() => {
    const all = this.transactions.hasValue() ? this.transactions.value() : [];
    const visible = filterTransactions(all, this.query(), LABELS);
    return sortTransactions(visible, this.sort(), LABELS).map((row) => ({
      ...row,
      tags: transactionTags(row, LABELS),
    }));
  });

  /** «40» o, con búsqueda, «12 de 40». */
  protected readonly count = computed(() =>
    this.query() ? `${this.rows().length} ${t.of} ${this.total()}` : String(this.total()),
  );

  protected sortBy(key: TransactionSortKey): void {
    this.sort.update((current) => nextSort(current, key));
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
