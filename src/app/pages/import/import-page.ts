import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TEXTS } from '@ui/texts';
import { DbService } from '@services/db/db-service';
import { StatementReader } from '@services/import/statement-reader';
import { BANK_PROFILES } from '@domain/imports/bank-profiles';
import { statementErrorCode } from '@domain/imports/bank-statement';
import type { CategoryOption, ImportBatchResult } from '@domain/imports/import-batch';
import {
  countSuggested,
  createDraft,
  draftErrors,
  draftToBatch,
  editDraft,
  isEdited,
  summarizeDraft,
  suggestionInUse,
  type DraftEdit,
  type DraftRow,
} from '@domain/imports/import-draft';
import { statementPeriod, type ImportedStatement } from '@domain/imports/imported-statement';
import { centsToInput } from '@domain/money/parse-cents';
import type { CategorySuggestion } from '@domain/suggestions/category-suggestion';
import { IsoDatePipe } from '@ui/format/iso-date-pipe';
import { PeriodLabelPipe } from '@ui/format/period-label-pipe';

type Step = 'elegir' | 'leyendo' | 'revisar' | 'guardado';
type RowStatus = 'new' | 'edited' | 'duplicate' | 'excluded' | 'invalid';

const t = TEXTS.imports;

const STATUS_LABELS: Readonly<Record<RowStatus, string>> = {
  new: t.statusNew,
  edited: t.statusEdited,
  duplicate: t.statusDuplicate,
  excluded: t.statusExcluded,
  invalid: t.statusInvalid,
};

const SUGGESTION_LABELS: Readonly<
  Record<CategorySuggestion['source'], { icon: string; label: string }>
> = {
  regla: { icon: 'rule', label: t.suggestionRule },
  sugerencia: { icon: 'auto_awesome', label: t.suggestionHistory },
};

/**
 * Importación de un extracto bancario (T6.4–T6.5): elegir el fichero, revisar y corregir los
 * movimientos en una tabla editable y guardarlos. Hasta que se confirma no se escribe nada.
 */
@Component({
  selector: 'app-import-page',
  imports: [
    IsoDatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    PeriodLabelPipe,
    RouterLink,
  ],
  templateUrl: './import-page.html',
  styleUrl: './import-page.scss',
})
export class ImportPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly reader = inject(StatementReader);

  protected readonly banks = BANK_PROFILES.map((profile) => profile.institution).join(', ');

  protected readonly step = signal<Step>('elegir');
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly statement = signal<ImportedStatement | null>(null);
  protected readonly categories = signal<readonly CategoryOption[]>([]);
  protected readonly result = signal<ImportBatchResult | null>(null);
  private readonly draft = signal<readonly DraftRow[]>([]);

  /** El mes del extracto si cae entero en uno; si abarca varios se muestra el intervalo. */
  protected readonly period = computed(() => {
    const statement = this.statement();
    return statement ? statementPeriod(statement) : null;
  });

  protected readonly rows = computed(() =>
    this.draft().map((row) => {
      const errors = draftErrors(row);
      const status = rowStatus(row, errors.length > 0);
      const suggestion = suggestionInUse(row);
      return {
        row,
        status,
        statusLabel: STATUS_LABELS[status],
        suggestion: suggestion && SUGGESTION_LABELS[suggestion.source],
        edited: isEdited(row),
        descriptionInvalid: errors.includes('description'),
        amountInvalid: errors.includes('amount'),
        noteInvalid: errors.includes('note'),
      };
    }),
  );

  protected readonly summary = computed(() => summarizeDraft(this.draft()));
  protected readonly suggested = computed(() => countSuggested(this.draft()));
  protected readonly canSave = computed(
    () => !this.saving() && this.summary().invalid === 0 && this.summary().toSave > 0,
  );

  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Permite volver a elegir el mismo fichero tras un error o una cancelación.
    input.value = '';
    if (!file) return;

    this.error.set(null);
    this.step.set('leyendo');
    try {
      const statement = await this.reader.read(file);
      if (!this.db.ready()) await this.db.openLocal();
      const [existing, categories, suggestions, descriptions] = await Promise.all([
        this.db.existingHashes(statement.movements.map((movement) => movement.dedupeHash)),
        this.db.categoryOptions(),
        this.suggestions(statement),
        this.descriptions(statement),
      ]);
      this.statement.set(statement);
      this.categories.set(categories);
      this.draft.set(createDraft(statement, new Set(existing), suggestions, descriptions));
      this.step.set('revisar');
    } catch (error) {
      this.error.set(t.errors[statementErrorCode(error) ?? 'desconocido']);
      this.step.set('elegir');
    }
  }

  /** Las categorías propuestas (ADR-0018). Si fallan, se revisa igual, sin propuestas. */
  private async suggestions(
    statement: ImportedStatement,
  ): Promise<readonly (CategorySuggestion | null)[]> {
    try {
      return await this.db.suggestCategories({
        institution: statement.institution,
        ibanLast4: statement.ibanLast4,
        movements: statement.movements.map((movement) => ({
          text: movement.description,
          amountCents: movement.amountCents,
        })),
      });
    } catch {
      return [];
    }
  }

  /** Los conceptos que dejan las reglas de concepto (ADR-0024). Si fallan, los del banco. */
  private async descriptions(statement: ImportedStatement): Promise<readonly string[]> {
    try {
      return await this.db.rewriteDescriptions(
        statement.movements.map((movement) => movement.description),
      );
    } catch {
      return [];
    }
  }

  protected edit(index: number, change: DraftEdit): void {
    this.draft.update((rows) => editDraft(rows, index, change));
  }

  protected setCategory(index: number, value: string): void {
    this.edit(index, { categoryId: value === '' ? null : Number(value) });
  }

  /** Devuelve el concepto y el importe a lo que dice el banco. */
  protected restore(index: number, row: DraftRow): void {
    this.edit(index, {
      description: row.movement.description,
      amountText: centsToInput(row.movement.amountCents),
    });
  }

  protected async save(): Promise<void> {
    const statement = this.statement();
    if (!statement || !this.canSave()) return;

    this.error.set(null);
    this.saving.set(true);
    try {
      this.result.set(await this.db.commitImport(draftToBatch(statement, this.draft())));
      this.step.set('guardado');
    } catch {
      this.error.set(t.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  /** Descarta la revisión (o el resultado) y vuelve a pedir un fichero. */
  protected reset(): void {
    this.statement.set(null);
    this.draft.set([]);
    this.result.set(null);
    this.error.set(null);
    this.step.set('elegir');
  }
}

function rowStatus(row: DraftRow, invalid: boolean): RowStatus {
  if (row.duplicate) return 'duplicate';
  if (!row.included) return 'excluded';
  if (invalid) return 'invalid';
  return isEdited(row) ? 'edited' : 'new';
}
