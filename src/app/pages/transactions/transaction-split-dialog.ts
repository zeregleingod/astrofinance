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
import {
  FormField,
  FormRoot,
  applyEach,
  form,
  validate,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@ui/texts';
import { DbService } from '@services/db/db-service';
import type { CategoryOption } from '@domain/imports/import-batch';
import { centsToInput, parseCents } from '@domain/money/parse-cents';
import type { TransactionRow } from '@domain/reports/transaction-row';
import { TRANSACTION_TEXT_MAX } from '@domain/transactions/transaction-edit';
import { checkSplits, type SplitLine } from '@domain/transactions/transaction-split';
import { CentsPipe } from '@ui/format/cents-pipe';
import { IsoDatePipe } from '@ui/format/iso-date-pipe';

export interface TransactionSplitData {
  readonly row: TransactionRow;
  /** Las subcategorías que se pueden asignar (`Principal › Subcategoría`). */
  readonly categories: readonly CategoryOption[];
}

/**
 * Un submovimiento tal como se escribe: el importe va sin signo (el del movimiento se pone al
 * guardar), igual que el total que se enseña arriba.
 */
interface Draft {
  /** Identifica la fila en la lista mientras se edita. */
  readonly key: number;
  readonly id: number | null;
  readonly description: string;
  readonly categoryId: string;
  readonly amount: string;
  readonly shared: boolean;
  /** Los gastos que devuelve, si es parte de un ingreso (ADR-0021). */
  readonly refundsTo: readonly string[];
}

const t = TEXTS.transactions.splits;

/**
 * Divide un movimiento en submovimientos (ADR-0019). Arriba, el movimiento y una barra con lo
 * repartido; debajo, una fila por submovimiento (concepto, subcategoría e importe) y, al final,
 * el resto sin dividir, que se queda en la categoría del movimiento. Los importes se enseñan sin
 * signo, junto a «Gasto» o «Ingreso». Se cierra con `true` si se ha guardado.
 */
@Component({
  selector: 'app-transaction-split-dialog',
  imports: [
    CentsPipe,
    FormField,
    FormRoot,
    IsoDatePipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './transaction-split-dialog.html',
  styleUrl: './transaction-split-dialog.scss',
})
export class TransactionSplitDialog {
  protected readonly texts = TEXTS;
  private readonly data = inject<TransactionSplitData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TransactionSplitDialog, boolean>>(MatDialogRef);
  private readonly db = inject(DbService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly row = this.data.row;
  protected readonly kind = this.row.amountCents < 0 ? t.expense : t.income;
  protected readonly totalCents = Math.abs(this.row.amountCents);
  /**
   * Lo que se puede dividir: el importe menos lo que el ingreso ya devuelve con lo no dividido
   * (ADR-0021); eso no se reparte.
   */
  private readonly parentCents = this.row.amountCents - this.row.refundingCents;
  protected readonly divisibleCents = Math.abs(this.parentCents);

  /** Las subcategorías y, si algún submovimiento está en una que ya no se ofrece, también esa. */
  protected readonly categories: readonly CategoryOption[] = [
    ...this.row.splits
      .filter(
        (s) =>
          s.categoryId !== null &&
          !this.data.categories.some((option) => option.id === s.categoryId),
      )
      .map((s) => ({ id: s.categoryId ?? 0, label: placeLabel(s) })),
    ...this.data.categories,
  ];

  /** Dónde se queda lo que no se divide: la categoría del movimiento. */
  protected readonly parentPlace = placeLabel(this.row);

  private nextKey = 0;

  private readonly model = signal({
    lines: this.row.splits.map((s): Draft => ({
      key: this.nextKey++,
      id: s.id,
      description: s.description,
      categoryId: s.categoryId === null ? '' : String(s.categoryId),
      amount: centsToInput(Math.abs(s.amountCents)),
      shared: s.shared,
      refundsTo: s.refundsTo,
    })),
  });

  /** Los submovimientos como se guardarían; un importe que no se entiende queda a 0 (no vale). */
  private readonly splits = computed(() =>
    this.model().lines.map((line): SplitLine => ({
      id: line.id,
      description: line.description,
      categoryId: line.categoryId === '' ? null : Number(line.categoryId),
      amountCents: this.signed(line.amount),
    })),
  );

  protected readonly check = computed(() => checkSplits(this.parentCents, this.splits()));
  /** Sin signo, como el total: lo repartido y lo que queda (o lo que sobra, si se pasan). */
  protected readonly dividedCents = computed(() =>
    Math.abs(this.parentCents - this.check().unsplitCents),
  );
  protected readonly restCents = computed(() => Math.abs(this.check().unsplitCents));
  protected readonly splitForm = form(
    this.model,
    (path) => {
      applyEach(path.lines, (line) => {
        validate(line.description, ({ value }) => {
          const description = value().trim();
          if (description === '') return { kind: 'required', message: t.errors.description };
          return description.length > TRANSACTION_TEXT_MAX
            ? { kind: 'maxLength', message: t.errors.tooLong }
            : null;
        });
        validate(line.amount, ({ value }) =>
          this.signed(value()) === 0 ? { kind: 'amount', message: t.errors.amount } : null,
        );
      });
      validate(path.lines, () => (this.check().exceeds ? { kind: 'exceeds' } : null));
    },
    { submission: { action: () => this.save() } },
  );

  protected readonly error = signal<string | null>(null);

  protected line(index: number) {
    const field = this.splitForm.lines[index];
    if (!field) throw new RangeError(`No hay submovimiento ${index}.`);
    return field;
  }

  /** Añade un submovimiento con lo que queda sin dividir y lleva el foco a su concepto. */
  protected add(): void {
    const rest = this.check().exceeds ? 0 : this.restCents();
    const key = this.nextKey++;
    this.model.update(({ lines }) => ({
      lines: [
        ...lines,
        {
          key,
          id: null,
          description: '',
          categoryId: this.row.categoryId === null ? '' : String(this.row.categoryId),
          amount: rest > 0 ? centsToInput(rest) : '',
          shared: false,
          refundsTo: [],
        },
      ],
    }));
    this.focus(`split-concept-${key}`);
  }

  /** Quita un submovimiento; el foco va al de al lado o, si no queda ninguno, a «Añadir». */
  protected remove(index: number): void {
    const lines = this.model().lines;
    const next = lines[index + 1] ?? lines[index - 1];
    this.model.set({ lines: lines.filter((_, i) => i !== index) });
    void this.announcer.announce(t.removed);
    this.focus(next ? `split-concept-${next.key}` : 'split-add');
  }

  private focus(id: string): void {
    afterNextRender(() => this.host.querySelector<HTMLElement>(`#${id}`)?.focus(), {
      injector: this.injector,
    });
  }

  /** El importe escrito, en céntimos con el signo del movimiento; 0 si no es un importe. */
  private signed(amount: string): number {
    const cents = parseCents(amount);
    if (cents === null) return 0;
    return this.row.amountCents < 0 ? -Math.abs(cents) : Math.abs(cents);
  }

  private async save(): Promise<TreeValidationResult> {
    this.error.set(null);
    try {
      await this.db.saveSplits({ transactionId: this.row.id, splits: this.splits() });
    } catch {
      this.error.set(t.saveError);
      return undefined;
    }
    this.dialogRef.close(true);
    return undefined;
  }
}

function placeLabel(place: {
  readonly categoryName: string | null;
  readonly subcategoryName: string | null;
}): string {
  if (place.categoryName === null) return TEXTS.dashboard.uncategorized;
  return place.subcategoryName === null
    ? place.categoryName
    : `${place.categoryName} › ${place.subcategoryName}`;
}
