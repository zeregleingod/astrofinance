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
  viewChild,
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
import {
  CONCEPT_RULE_OPERATORS,
  CONCEPT_RULE_SCOPES,
  cleanReplacement,
  conceptRuleError,
  conceptRuleErrorCode,
  effectiveScope,
  type ConceptChange,
  type ConceptRuleOperator,
  type ConceptRuleRow,
  type ConceptRuleScope,
} from '@domain/rules/concept-rule';
import { cleanPattern } from '@domain/rules/rule';
import { ConfirmDialog, type ConfirmDialogData } from '@shared/confirm-dialog/confirm-dialog';
import { CentsPipe } from '@shared/format/cents-pipe';
import { IsoDatePipe } from '@shared/format/iso-date-pipe';

/** Los campos de una regla en un formulario. */
interface ConceptRuleModel {
  operator: ConceptRuleOperator;
  pattern: string;
  scope: ConceptRuleScope;
  replacement: string;
}

type Problem = { kind: string; message: string } | null;

const t = TEXTS.conceptRules;

const EMPTY: ConceptRuleModel = {
  operator: 'contiene',
  pattern: '',
  scope: 'coincidencia',
  replacement: '',
};

/**
 * Configuración › Reglas de concepto (ADR-0024). Como las reglas de categoría: arriba se dan de
 * alta; en la tabla se editan o eliminan, y «Aplicar a movimientos existentes» enseña qué
 * conceptos cambiarían: nada se toca hasta que se confirma.
 */
@Component({
  selector: 'app-concept-rules-page',
  imports: [
    CentsPipe,
    FormField,
    FormRoot,
    IsoDatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './concept-rules-page.html',
  // La misma página que las reglas de categoría, con lo propio de estas reglas.
  styleUrls: ['./category-rules-page.scss', './concept-rules-page.scss'],
})
export class ConceptRulesPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly operators = CONCEPT_RULE_OPERATORS;
  protected readonly scopes = CONCEPT_RULE_SCOPES;

  private readonly data = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => this.db.conceptRules(abortSignal),
  });

  /** Conserva lo anterior mientras se recarga tras un cambio, para que la tabla no parpadee. */
  private readonly loaded = linkedSignal<
    readonly ConceptRuleRow[] | undefined,
    readonly ConceptRuleRow[]
  >({
    source: () => this.data.value(),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  protected readonly rules = computed(() => this.loaded());

  protected readonly error = signal<string | null>(null);
  /** Último cambio guardado, para anunciarlo. */
  protected readonly notice = signal<string | null>(null);

  // --- Alta de una regla ---

  private readonly model = signal<ConceptRuleModel>(EMPTY);
  private readonly attempted = signal(false);

  protected readonly ruleForm = form(
    this.model,
    (path) => {
      validate(path.pattern, () => patternProblem(this.model(), this.rules()));
      validate(path.replacement, () => replacementProblem(this.model()));
    },
    { submission: { action: () => this.save(), onInvalid: () => this.attempted.set(true) } },
  );

  /** Los errores no se enseñan por pasar por un campo vacío: solo al escribir o guardar. */
  protected readonly showPatternError = computed(() => {
    const pattern = this.ruleForm.pattern();
    return pattern.invalid() && (pattern.dirty() || this.attempted());
  });
  protected readonly showReplacementError = computed(
    () => this.ruleForm.replacement().invalid() && this.attempted(),
  );

  // --- Edición en la tabla ---

  /** La regla que se está editando en su fila. */
  protected readonly editing = signal<ConceptRuleRow | null>(null);
  private readonly rowModel = signal<ConceptRuleModel>(EMPTY);
  private readonly rowAttempted = signal(false);

  protected readonly rowForm = form(
    this.rowModel,
    (path) => {
      validate(path.pattern, () => {
        const self = this.editing()?.id;
        return patternProblem(
          this.rowModel(),
          this.rules().filter((rule) => rule.id !== self),
        );
      });
      validate(path.replacement, () => replacementProblem(this.rowModel()));
    },
    { submission: { action: () => this.saveRow(), onInvalid: () => this.rowAttempted.set(true) } },
  );

  protected readonly showRowError = computed(() => {
    const { pattern, replacement } = this.rowForm;
    return (
      (pattern().invalid() && (pattern().dirty() || this.rowAttempted())) ||
      (replacement().invalid() && this.rowAttempted())
    );
  });

  // --- Aplicar a los movimientos existentes ---

  protected readonly previewing = signal(false);
  protected readonly applying = signal(false);
  /**
   * Los cambios que se han enseñado y esperan confirmación. Cualquier cambio en los datos los
   * deja sin valor: se descartan y hay que volver a pedirlos.
   */
  protected readonly preview = linkedSignal<number, readonly ConceptChange[] | null>({
    source: () => this.db.dataVersion(),
    computation: () => null,
  });

  /** Descripciones de cada sección: se ven al pulsar su icono de información. */
  protected readonly introOpen = signal(false);
  protected readonly listInfoOpen = signal(false);

  private readonly toolbar = viewChild('toolbar', { read: ElementRef });

  constructor() {
    // La cabecera de la tabla se queda fija justo debajo del alta, cuyo alto cambia al
    // mostrar su descripción, un error o el aviso de lo guardado.
    effect((onCleanup) => {
      const host = this.host.nativeElement;
      const toolbar = this.toolbar()?.nativeElement as HTMLElement | undefined;
      const view = host.ownerDocument.defaultView;
      if (!toolbar || !view || !('ResizeObserver' in view)) return;
      const observer = new view.ResizeObserver(() =>
        host.style.setProperty('--toolbar-height', `${toolbar.offsetHeight}px`),
      );
      observer.observe(toolbar);
      onCleanup(() => observer.disconnect());
    });
    // Sin BD abierta (primera visita, o al salir de la demo) se abre la del usuario.
    effect(() => {
      if (this.db.status() === 'cerrada') {
        untracked(() => void this.db.openLocal().catch(() => undefined));
      }
    });
  }

  /** El texto se escribe en mayúsculas, como los conceptos del banco, salvo en una expresión. */
  protected isUpper(operator: ConceptRuleOperator): boolean {
    return operator !== 'regex';
  }

  /** «Es exactamente» siempre cambia el concepto entero: no hay nada que elegir. */
  protected hasScope(operator: ConceptRuleOperator): boolean {
    return operator !== 'exacto';
  }

  /** Cómo se nombra una regla al anunciarla o al etiquetar sus botones. */
  protected label(rule: Pick<ConceptRuleRow, 'operator' | 'pattern'>): string {
    return `${t.operators[rule.operator]} «${rule.pattern}»`;
  }

  protected isEditing(rule: ConceptRuleRow): boolean {
    return this.editing()?.id === rule.id;
  }

  protected edit(rule: ConceptRuleRow): void {
    this.editing.set(rule);
    this.rowForm().reset({
      operator: rule.operator,
      pattern: rule.pattern,
      scope: rule.scope,
      replacement: rule.replacement,
    });
    this.rowAttempted.set(false);
    this.afterRender(() => this.rowForm.pattern().focusBoundControl());
  }

  protected cancelEdit(): void {
    const rule = this.editing();
    this.editing.set(null);
    if (rule) this.focusAfterRender(`#edit-concept-rule-${rule.id}`);
  }

  /** Pide confirmación antes de eliminar; los conceptos que cambió no se tocan. */
  protected remove(rule: ConceptRuleRow): void {
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

  /** Busca qué conceptos cambiarían y los enseña; no cambia nada. */
  protected async showPreview(): Promise<void> {
    this.clearMessages();
    this.previewing.set(true);
    try {
      const changes = await this.db.previewConceptRules();
      if (changes.length === 0) {
        this.notice.set(t.previewNothing);
      } else {
        this.preview.set(changes);
        this.focusAfterRender('#concept-preview-title');
      }
    } catch {
      this.error.set(t.previewError);
    } finally {
      this.previewing.set(false);
    }
  }

  protected cancelPreview(): void {
    this.preview.set(null);
    this.focusAfterRender('#apply-concept-rules');
  }

  protected async confirmPreview(): Promise<void> {
    this.clearMessages();
    this.applying.set(true);
    try {
      const changed = await this.db.applyConceptRules();
      this.preview.set(null);
      this.notice.set(`${t.applied} ${changed}.`);
      this.focusAfterRender('#apply-concept-rules');
    } catch {
      this.error.set(t.applyError);
    } finally {
      this.applying.set(false);
    }
  }

  private async save(): Promise<TreeValidationResult> {
    const rule = cleanRule(this.model());

    this.clearMessages();
    try {
      await this.db.createConceptRule(rule);
    } catch (error) {
      const code = conceptRuleErrorCode(error);
      if (code) return { kind: code, message: t.errors[code], fieldTree: this.ruleForm.pattern };
      this.error.set(t.saveError);
      return undefined;
    }
    this.notice.set(`${t.added} ${this.label(rule)}`);
    // Se conservan la condición y el alcance: lo habitual es crear varias reglas parecidas.
    this.ruleForm().reset({ ...EMPTY, operator: rule.operator, scope: this.model().scope });
    this.attempted.set(false);
    this.ruleForm.pattern().focusBoundControl();
    return undefined;
  }

  private async saveRow(): Promise<TreeValidationResult> {
    const current = this.editing();
    if (!current) return undefined;
    const rule = cleanRule(this.rowModel());
    const changed =
      rule.operator !== current.operator ||
      rule.pattern !== current.pattern ||
      rule.scope !== current.scope ||
      rule.replacement !== current.replacement;

    this.clearMessages();
    if (changed) {
      try {
        await this.db.updateConceptRule({ id: current.id, ...rule });
      } catch (error) {
        const code = conceptRuleErrorCode(error);
        if (code) return { kind: code, message: t.errors[code], fieldTree: this.rowForm.pattern };
        this.error.set(t.saveError);
        return undefined;
      }
      this.notice.set(`${t.saved} ${this.label(rule)}`);
    }
    this.cancelEdit();
    return undefined;
  }

  private async delete(rule: ConceptRuleRow): Promise<void> {
    this.clearMessages();
    try {
      await this.db.deleteConceptRule(rule.id);
    } catch {
      this.error.set(t.deleteError);
      return;
    }
    this.notice.set(`${t.deleted} ${this.label(rule)}`);
    this.editing.set(null);
    // El botón que abrió el diálogo ya no existe: el foco vuelve al título de la lista.
    this.focusAfterRender('#concept-rule-list-title');
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

/** La regla tal como se guarda. */
function cleanRule(model: ConceptRuleModel): ConceptRuleModel {
  return {
    operator: model.operator,
    pattern: cleanPattern(model.operator, model.pattern),
    scope: effectiveScope(model.operator, model.scope),
    replacement: cleanReplacement(model.replacement),
  };
}

/** Lo que falla en la regla, si es del campo de texto; lo de la sustitución va aparte. */
function patternProblem(model: ConceptRuleModel, others: readonly ConceptRuleRow[]): Problem {
  const code = conceptRuleError(cleanRule(model), others);
  return code && !isReplacementCode(code) ? { kind: code, message: t.errors[code] } : null;
}

function replacementProblem(model: ConceptRuleModel): Problem {
  const code = conceptRuleError(cleanRule(model));
  return code && isReplacementCode(code) ? { kind: code, message: t.errors[code] } : null;
}

function isReplacementCode(code: string): boolean {
  return code === 'sustitucion-vacia' || code === 'sustitucion-larga';
}
