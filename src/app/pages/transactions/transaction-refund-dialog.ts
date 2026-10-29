import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@ui/texts';
import { DbService } from '@services/db/db-service';
import type { TransactionRow } from '@domain/reports/transaction-row';
import { normalizeSearch } from '@domain/reports/transaction-table';
import {
  checkRefunds,
  refundSourceKey,
  type RefundCandidate,
  type RefundLink,
} from '@domain/transactions/refund';
import { CentsPipe } from '@ui/format/cents-pipe';
import { IsoDatePipe } from '@ui/format/iso-date-pipe';

export interface TransactionRefundData {
  /** El gasto. */
  readonly row: TransactionRow;
}

/** Cuántos ingresos se ofrecen sin buscar: los de fecha más cercana al gasto. */
const SHOWN_CANDIDATES = 6;

const t = TEXTS.transactions.refunds;

/**
 * Vincula a un gasto los ingresos que lo devuelven (ADR-0021), p. ej. el Bizum de cada amigo
 * de una cena. Arriba, el gasto y una barra con lo devuelto; debajo, los ingresos vinculados y lo
 * que el gasto cuesta de verdad; al final, los ingresos que se pueden añadir, con buscador. Un
 * ingreso se vincula por su importe (lo que tiene libre, si ya devuelve parte de otro gasto): no
 * se escribe. Se cierra con `true` si se guarda.
 */
@Component({
  selector: 'app-transaction-refund-dialog',
  imports: [
    CentsPipe,
    IsoDatePipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './transaction-refund-dialog.html',
  styleUrl: './transaction-refund-dialog.scss',
})
export class TransactionRefundDialog {
  protected readonly texts = TEXTS;
  private readonly data = inject<TransactionRefundData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TransactionRefundDialog, boolean>>(MatDialogRef);
  private readonly db = inject(DbService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly row = this.data.row;
  protected readonly totalCents = Math.abs(this.row.amountCents);
  protected readonly place =
    this.row.categoryName === null
      ? TEXTS.dashboard.uncategorized
      : [this.row.categoryName, this.row.subcategoryName].filter(Boolean).join(' › ');

  /** Los ingresos que lo devuelven o pueden devolverlo; `null` mientras se cargan. */
  private readonly candidates = signal<readonly RefundCandidate[] | null>(null);
  protected readonly loading = computed(() => this.candidates() === null);

  /** Las devoluciones, en el orden en que se vincularon; cada una con su importe fijo. */
  private readonly links = signal<readonly RefundLink[]>([]);

  constructor() {
    this.db
      .expenseRefundOptions(this.row.id)
      .then(({ candidates }) => {
        this.candidates.set(candidates);
        this.links.set(
          candidates
            .filter((c) => c.linkedCents !== null)
            .map((c) => ({ ...sourceOf(c), amountCents: c.linkedCents ?? 0 })),
        );
      })
      .catch(() => {
        this.candidates.set([]);
        this.error.set(t.saveError);
      });
  }

  /** Cada origen (ingreso o submovimiento suyo) por su clave. */
  private readonly byKey = computed(
    () => new Map((this.candidates() ?? []).map((c) => [refundSourceKey(sourceOf(c)), c] as const)),
  );

  /** Las devoluciones con su origen, para enseñarlas. */
  protected readonly linked = computed(() =>
    this.links().flatMap((link) => {
      const key = refundSourceKey(link);
      const income = this.byKey().get(key);
      return income ? [{ ...link, key, income }] : [];
    }),
  );

  protected readonly check = computed(() =>
    checkRefunds(
      this.row.amountCents,
      this.links(),
      new Map([...this.byKey()].map(([key, c]) => [key, c.availableCents])),
    ),
  );
  /** Lo que el gasto cuesta (o lo que sobra, si se devuelve de más), en positivo. */
  protected readonly restCents = computed(() => Math.abs(this.check().costCents));

  /**
   * Los ingresos que se pueden añadir: con algo libre, sin vincular aún y que caben en lo que
   * falta por devolver (se vinculan enteros), filtrados por la búsqueda.
   */
  protected readonly query = signal('');
  private readonly unlinked = computed(() => {
    const linked = new Set(this.links().map(refundSourceKey));
    const terms = normalizeSearch(this.query()).split(' ').filter(Boolean);
    return (this.candidates() ?? []).filter(
      (c) =>
        !linked.has(refundSourceKey(sourceOf(c))) &&
        c.availableCents > 0 &&
        c.availableCents <= this.check().costCents &&
        terms.every((term) =>
          normalizeSearch(`${c.description} ${c.accountName} ${c.date}`).includes(term),
        ),
    );
  });
  protected readonly shown = computed(() =>
    this.unlinked()
      .slice(0, SHOWN_CANDIDATES)
      .map((c) => ({ ...c, key: refundSourceKey(sourceOf(c)) })),
  );
  protected readonly hidden = computed(() => this.unlinked().length - this.shown().length);

  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  /** Vincula un ingreso (o una parte suya) por su importe libre; el foco va a su botón de quitar. */
  protected add(candidate: RefundCandidate): void {
    const source = sourceOf(candidate);
    this.links.update((links) => [...links, { ...source, amountCents: candidate.availableCents }]);
    void this.announcer.announce(`${t.added} ${candidate.description}`);
    this.focus(removeId(refundSourceKey(source)));
  }

  /** El id del botón de quitar de una devolución. */
  protected readonly removeId = removeId;

  /** Quita una devolución; el foco va a la de al lado o, si no queda ninguna, al buscador. */
  protected remove(index: number): void {
    const links = this.links();
    const next = links[index + 1] ?? links[index - 1];
    this.links.set(links.filter((_, i) => i !== index));
    void this.announcer.announce(t.removed);
    this.focus(next ? removeId(refundSourceKey(next)) : 'refund-search');
  }

  private focus(id: string): void {
    afterNextRender(() => this.host.querySelector<HTMLElement>(`#${id}`)?.focus(), {
      injector: this.injector,
    });
  }

  protected async save(): Promise<void> {
    if (!this.check().valid || this.saving()) return;
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.db.saveRefunds({ expenseId: this.row.id, links: this.links() });
    } catch {
      this.error.set(t.saveError);
      this.saving.set(false);
      return;
    }
    this.dialogRef.close(true);
  }
}

/** El origen de una devolución que ofrece un candidato. */
function sourceOf(candidate: RefundCandidate): Omit<RefundLink, 'amountCents'> {
  return { reimbursementTxId: candidate.id, reimbursementSplitId: candidate.splitId };
}

function removeId(key: string): string {
  return `refund-remove-${key.replace(':', '-')}`;
}
