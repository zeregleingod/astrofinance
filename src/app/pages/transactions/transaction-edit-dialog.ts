import { Component, computed, inject, signal } from '@angular/core';
import {
  FormField,
  FormRoot,
  form,
  validate,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule, type MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TEXTS } from '@ui/texts';
import { DbService } from '@services/db/db-service';
import { isIsoDate } from '@domain/dates/period';
import type { CategoryOption } from '@domain/imports/import-batch';
import type { TransactionRow } from '@domain/reports/transaction-row';
import { TRANSACTION_TEXT_MAX } from '@domain/transactions/transaction-edit';
import { dateToIso, isoToDate, provideEsDatepicker } from '@ui/dates/es-datepicker';
import { CentsPipe } from '@ui/format/cents-pipe';
import { IsoDatePipe } from '@ui/format/iso-date-pipe';

export interface TransactionEditData {
  readonly row: TransactionRow;
  /** Las subcategorías que se pueden asignar (`Principal › Subcategoría`). */
  readonly categories: readonly CategoryOption[];
}

const t = TEXTS.transactions.edit;

/**
 * Edición de un movimiento guardado (T5.2, ADR-0016): concepto, fecha imputada, subcategoría y
 * observaciones. Lo que viene del banco (importe, fecha original, cuenta y concepto original)
 * se enseña pero no se cambia. Se cierra con `true` si se ha guardado.
 */
@Component({
  selector: 'app-transaction-edit-dialog',
  imports: [
    CentsPipe,
    FormField,
    FormRoot,
    IsoDatePipe,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [provideEsDatepicker()],
  templateUrl: './transaction-edit-dialog.html',
  styleUrl: './transaction-edit-dialog.scss',
})
export class TransactionEditDialog {
  protected readonly texts = TEXTS;
  private readonly data = inject<TransactionEditData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TransactionEditDialog, boolean>>(MatDialogRef);
  private readonly db = inject(DbService);

  protected readonly row = this.data.row;

  /** Las subcategorías; si el movimiento está en una principal (datos antiguos), también esa. */
  protected readonly categories: readonly CategoryOption[] =
    this.row.categoryId === null ||
    this.data.categories.some((option) => option.id === this.row.categoryId)
      ? this.data.categories
      : [{ id: this.row.categoryId, label: this.row.categoryName ?? '' }, ...this.data.categories];

  private readonly model = signal({
    description: this.row.description,
    bookedDate: this.row.bookedDate,
    categoryId: this.row.categoryId === null ? '' : String(this.row.categoryId),
    note: this.row.note ?? '',
  });

  /** Lo escrito en el campo de la fecha no es una fecha. */
  private readonly unreadableDate = signal(false);

  protected readonly editForm = form(
    this.model,
    (path) => {
      validate(path.description, ({ value }) => {
        const description = value().trim();
        if (description === '') return { kind: 'required', message: t.errors.description };
        return description.length > TRANSACTION_TEXT_MAX
          ? { kind: 'maxLength', message: t.errors.tooLong }
          : null;
      });
      validate(path.bookedDate, ({ value }) =>
        this.unreadableDate() || !isIsoDate(value())
          ? { kind: 'date', message: t.errors.date }
          : null,
      );
      validate(path.note, ({ value }) =>
        value().trim().length > TRANSACTION_TEXT_MAX
          ? { kind: 'maxLength', message: t.errors.tooLong }
          : null,
      );
    },
    { submission: { action: () => this.save() } },
  );

  protected readonly error = signal<string | null>(null);
  protected readonly bookedDateValue = computed(() => isoToDate(this.model().bookedDate));

  /** El concepto ya no es el del banco: se ofrece volver a él. */
  protected readonly descriptionEdited = computed(() => {
    const original = this.row.originalDescription;
    return original !== null && this.model().description.trim() !== original;
  });

  /** La fecha imputada no es la original: se ofrece volver a ella. */
  protected readonly dateMoved = computed(() => this.model().bookedDate !== this.row.opDate);

  /** Recoge la fecha elegida en el calendario o escrita a mano. */
  protected setDate(event: MatDatepickerInputEvent<Date>): void {
    const written = (event.targetElement as HTMLInputElement).value.trim() !== '';
    this.unreadableDate.set(written && !event.value);
    if (event.value) this.editForm.bookedDate().value.set(dateToIso(event.value));
    else if (!written) this.editForm.bookedDate().value.set('');
  }

  protected restoreDescription(): void {
    if (this.row.originalDescription !== null) {
      this.editForm.description().value.set(this.row.originalDescription);
    }
  }

  protected restoreDate(): void {
    this.unreadableDate.set(false);
    this.editForm.bookedDate().value.set(this.row.opDate);
  }

  private async save(): Promise<TreeValidationResult> {
    const { description, bookedDate, categoryId, note } = this.model();
    this.error.set(null);
    try {
      await this.db.updateTransaction({
        id: this.row.id,
        description,
        bookedDate,
        categoryId: categoryId === '' ? null : Number(categoryId),
        note,
      });
    } catch {
      this.error.set(t.saveError);
      return undefined;
    }
    this.dialogRef.close(true);
    return undefined;
  }
}
