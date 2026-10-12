import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import {
  FormField,
  FormRoot,
  form,
  validate,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TEXTS } from '@core/i18n/texts';
import { DbService } from '@data/db/db-service';
import type { CategoryOption } from '@domain/imports/import-batch';
import {
  RULE_OPERATORS,
  cleanPattern,
  ruleErrorCode,
  rulePatternError,
  type RuleChange,
  type RuleOperator,
  type RuleRow,
} from '@domain/rules/rule';
import { ConfirmDialog, type ConfirmDialogData } from '@shared/confirm-dialog/confirm-dialog';
import { CentsPipe } from '@shared/format/cents-pipe';
import { IsoDatePipe } from '@shared/format/iso-date-pipe';

/** Los campos de una regla en un formulario; la categoría es el valor del desplegable. */
interface RuleModel {
  operator: RuleOperator;
  pattern: string;
  categoryId: string;
}

const t = TEXTS.categoryRules;

const EMPTY: RuleModel = { operator: 'contiene', pattern: '', categoryId: '' };

/**
 * Configuración › Reglas de categoría (T4.2–T4.3, ADR-0011). Arriba se dan de alta las reglas; en la tabla se
 * editan o eliminan, y «Aplicar a movimientos existentes» enseña qué movimientos cambiarían de
 * categoría: nada se toca hasta que se confirma.
 */
@Component({
  selector: 'app-category-rules-page',
  imports: [
    CentsPipe,
    FormField,
    FormRoot,
    IsoDatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './category-rules-page.html',
  styleUrl: './category-rules-page.scss',
})
export class CategoryRulesPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly operators = RULE_OPERATORS;

  private readonly data = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: async ({ abortSignal }) => {
      const [rules, categories] = await Promise.all([
        this.db.rules(abortSignal),
        this.db.categoryOptions(abortSignal),
      ]);
      return { rules, categories };
    },
  });

  /** Conserva lo anterior mientras se recarga tras un cambio, para que la tabla no parpadee. */
  private readonly loaded = linkedSignal<
    { rules: readonly RuleRow[]; categories: readonly CategoryOption[] } | undefined,
    { rules: readonly RuleRow[]; categories: readonly CategoryOption[] }
  >({
    source: () => this.data.value(),
    computation: (value, previous) => value ?? previous?.value ?? { rules: [], categories: [] },
  });

  protected readonly rules = computed(() => this.loaded().rules);
  protected readonly categories = computed(() => this.loaded().categories);

  protected readonly error = signal<string | null>(null);
  /** Último cambio guardado, para anunciarlo. */
  protected readonly notice = signal<string | null>(null);

  // --- Alta de una regla ---

  private readonly model = signal<RuleModel>(EMPTY);
  private readonly attempted = signal(false);

  protected readonly ruleForm = form(
    this.model,
    (path) => {
      validate(path.pattern, ({ value }) =>
        patternProblem(this.model().operator, value(), this.rules()),
      );
      validate(path.categoryId, ({ value }) => categoryProblem(value()));
    },
    { submission: { action: () => this.save(), onInvalid: () => this.attempted.set(true) } },
  );

  /** Los errores no se enseñan por pasar por un campo vacío: solo al escribir o guardar. */
  protected readonly showPatternError = computed(() => {
    const pattern = this.ruleForm.pattern();
    return pattern.invalid() && (pattern.dirty() || this.attempted());
  });
  protected readonly showCategoryError = computed(
    () => this.ruleForm.categoryId().invalid() && this.attempted(),
  );

  // --- Edición en la tabla ---

  /** La regla que se está editando en su fila. */
  protected readonly editing = signal<RuleRow | null>(null);
  private readonly rowModel = signal<RuleModel>(EMPTY);
  private readonly rowAttempted = signal(false);

  protected readonly rowForm = form(
    this.rowModel,
    (path) => {
      validate(path.pattern, ({ value }) => {
        const self = this.editing()?.id;
        const others = this.rules().filter((rule) => rule.id !== self);
        return patternProblem(this.rowModel().operator, value(), others);
      });
      validate(path.categoryId, ({ value }) => categoryProblem(value()));
    },
    { submission: { action: () => this.saveRow(), onInvalid: () => this.rowAttempted.set(true) } },
  );

  protected readonly showRowError = computed(() => {
    const pattern = this.rowForm.pattern();
    return pattern.invalid() && (pattern.dirty() || this.rowAttempted());
  });

  // --- Aplicar a los movimientos existentes ---

  protected readonly previewing = signal(false);
  protected readonly applying = signal(false);
  /**
   * Los cambios que se han enseñado y esperan confirmación. Cualquier cambio en los datos los
   * deja sin valor: se descartan y hay que volver a pedirlos.
   */
  protected readonly preview = linkedSignal<number, readonly RuleChange[] | null>({
    source: () => this.db.dataVersion(),
    computation: () => null,
  });

  constructor() {
    // Sin BD abierta (primera visita, o al salir de la demo) se abre la del usuario.
    effect(() => {
      if (this.db.status() === 'cerrada') {
        untracked(() => void this.db.openLocal().catch(() => undefined));
      }
    });
  }

  /** El texto se escribe en mayúsculas, como los conceptos del banco, salvo en una expresión. */
  protected isUpper(operator: RuleOperator): boolean {
    return operator !== 'regex';
  }

  /** Cómo se nombra una regla al anunciarla o al etiquetar sus botones. */
  protected label(rule: Pick<RuleRow, 'operator' | 'pattern'>): string {
    return `${t.operators[rule.operator]} «${rule.pattern}»`;
  }

  protected isEditing(rule: RuleRow): boolean {
    return this.editing()?.id === rule.id;
  }

  protected edit(rule: RuleRow): void {
    this.editing.set(rule);
    this.rowForm().reset({
      operator: rule.operator,
      pattern: rule.pattern,
      categoryId: String(rule.categoryId),
    });
    this.rowAttempted.set(false);
    this.afterRender(() => this.rowForm.pattern().focusBoundControl());
  }

  protected cancelEdit(): void {
    const rule = this.editing();
    this.editing.set(null);
    if (rule) this.focusAfterRender(`#edit-rule-${rule.id}`);
  }

  /** Pide confirmación antes de eliminar; lo que la regla clasificó conserva su categoría. */
  protected remove(rule: RuleRow): void {
    const data: ConfirmDialogData = {
      title: `${t.deleteQuestion} ${this.label(rule)}?`,
      lines: [
        rule.transactionCount > 0
          ? `${t.deleteUsed} ${rule.transactionCount}. ${t.deleteConsequence}`
          : t.deleteUnused,
        t.deleteIrreversible,
      ],
      confirm: t.deleteConfirm,
      cancel: t.deleteCancel,
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data,
        role: 'alertdialog',
        maxWidth: '480px',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) void this.delete(rule);
      });
  }

  /** Busca qué movimientos cambiarían y los enseña; no cambia nada. */
  protected async showPreview(): Promise<void> {
    this.clearMessages();
    this.previewing.set(true);
    try {
      const changes = await this.db.previewRules();
      if (changes.length === 0) {
        this.notice.set(t.previewNothing);
      } else {
        this.preview.set(changes);
        this.focusAfterRender('#preview-title');
      }
    } catch {
      this.error.set(t.previewError);
    } finally {
      this.previewing.set(false);
    }
  }

  protected cancelPreview(): void {
    this.preview.set(null);
    this.focusAfterRender('#apply-rules');
  }

  protected async confirmPreview(): Promise<void> {
    this.clearMessages();
    this.applying.set(true);
    try {
      const changed = await this.db.applyRules();
      this.preview.set(null);
      this.notice.set(`${t.applied} ${changed}.`);
      this.focusAfterRender('#apply-rules');
    } catch {
      this.error.set(t.applyError);
    } finally {
      this.applying.set(false);
    }
  }

  private async save(): Promise<TreeValidationResult> {
    const { operator, pattern, categoryId } = this.model();

    this.clearMessages();
    try {
      await this.db.createRule({ operator, pattern, categoryId: Number(categoryId) });
    } catch (error) {
      const code = ruleErrorCode(error);
      if (code) return { kind: code, message: t.errors[code], fieldTree: this.ruleForm.pattern };
      this.error.set(t.saveError);
      return undefined;
    }
    this.notice.set(
      `${t.added} ${this.label({ operator, pattern: cleanPattern(operator, pattern) })}`,
    );
    // Se conservan la condición y la categoría: lo habitual es crear varias reglas parecidas.
    this.ruleForm().reset({ operator, pattern: '', categoryId });
    this.attempted.set(false);
    this.ruleForm.pattern().focusBoundControl();
    return undefined;
  }

  private async saveRow(): Promise<TreeValidationResult> {
    const rule = this.editing();
    if (!rule) return undefined;
    const { operator, categoryId } = this.rowModel();
    const pattern = cleanPattern(operator, this.rowModel().pattern);
    const changed =
      operator !== rule.operator ||
      pattern !== rule.pattern ||
      Number(categoryId) !== rule.categoryId;

    this.clearMessages();
    if (changed) {
      try {
        await this.db.updateRule({
          id: rule.id,
          operator,
          pattern,
          categoryId: Number(categoryId),
        });
      } catch (error) {
        const code = ruleErrorCode(error);
        if (code) return { kind: code, message: t.errors[code], fieldTree: this.rowForm.pattern };
        this.error.set(t.saveError);
        return undefined;
      }
      this.notice.set(`${t.saved} ${this.label({ operator, pattern })}`);
    }
    this.cancelEdit();
    return undefined;
  }

  private async delete(rule: RuleRow): Promise<void> {
    this.clearMessages();
    try {
      await this.db.deleteRule(rule.id);
    } catch {
      this.error.set(t.deleteError);
      return;
    }
    this.notice.set(`${t.deleted} ${this.label(rule)}`);
    this.editing.set(null);
    // El botón que abrió el diálogo ya no existe: el foco vuelve al título de la lista.
    this.focusAfterRender('#rule-list-title');
  }

  private clearMessages(): void {
    this.error.set(null);
    this.notice.set(null);
  }

  private focusAfterRender(selector: string): void {
    this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }

  private afterRender(callback: () => void): void {
    afterNextRender(callback, { injector: this.injector });
  }
}

function patternProblem(
  operator: RuleOperator,
  pattern: string,
  others: readonly RuleRow[],
): { kind: string; message: string } | null {
  const code = rulePatternError(operator, cleanPattern(operator, pattern), others);
  return code ? { kind: code, message: t.errors[code] } : null;
}

function categoryProblem(categoryId: string): { kind: string; message: string } | null {
  return categoryId === '' ? { kind: 'categoria', message: t.categoryRequired } : null;
}
