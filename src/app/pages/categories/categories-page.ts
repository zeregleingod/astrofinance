import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
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
  type SchemaPathTree,
  type TreeValidationResult,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { LANGUAGES, TEXTS, language, type Language } from '@ui/texts';
import { Viewport } from '@services/viewport/viewport';
import { DbService } from '@services/db/db-service';
import type { CategoryKind } from '@domain/categories/category-kind';
import {
  CATEGORY_COLORS,
  CATEGORY_KINDS,
  categoryErrorCode,
  categoryTranslationError,
  groupTransactionCount,
  localizedName,
  moveItem,
  nextCategoryColor,
  sourcedNames,
  untranslatedLanguages,
  type CategoryGroup,
  type SourcedNames,
  type CategoryNames,
  type CategoryTranslations,
} from '@domain/categories/category-tree';
import { ConfirmDialog, type ConfirmDialogData } from '@ui/confirm-dialog/confirm-dialog';
import { InfoButton } from '@ui/info-button/info-button';
import {
  TranslatableInput,
  emptyTranslations,
  filledTranslations,
  translationsModel,
  type TranslationsModel,
} from '@ui/translatable-input/translatable-input';

/** Una categoría principal o subcategoría de la tabla, con lo necesario para editarla o eliminarla. */
interface CategoryRow extends CategoryNames {
  readonly id: number;
  /** En el idioma de la interfaz. */
  readonly name: string;
  readonly sourceLanguage: string;
  /** Sin nombre en el idioma de la interfaz: el idioma del que se ve en su lugar. */
  readonly fallback: { readonly code: string; readonly name: string } | null;
  /** `Principal › Subcategoría`, o solo el nombre si es una principal. */
  readonly label: string;
  /** La principal de una subcategoría; `null` si la fila es una principal. */
  readonly group: CategoryGroup | null;
  /** Solo las subcategorías tienen tipo. */
  readonly kind: CategoryKind | null;
  /** Solo las principales tienen color propio. */
  readonly color: string | null;
  /** Movimientos que la usan; en una principal, contando los de sus subcategorías. */
  readonly count: number;
  readonly subcategoryCount: number;
  /** Sus hermanas, con cuyos nombres no puede coincidir en ningún idioma. */
  readonly siblings: readonly CategoryNames[];
  /** Posición entre sus hermanas, desde 0, y cuántas son: solo se ordena entre ellas. */
  readonly position: number;
  readonly siblingCount: number;
}

interface CategoryCard {
  readonly group: CategoryGroup;
  readonly row: CategoryRow;
  readonly rows: readonly CategoryRow[];
}

/** Lo que se puede cambiar en una fila: el color en las principales, el tipo en las subcategorías. */
interface RowModel {
  kind: CategoryKind;
  color: string;
  /** El nombre en cada idioma de la interfaz. */
  translations: TranslationsModel;
}

/** La fila que se está editando en la tabla, o la subcategoría nueva que se está añadiendo. */
interface RowEditor {
  /** `null`: una subcategoría nueva de `group`. */
  readonly id: number | null;
  /** La principal de la subcategoría; `null` si se edita una principal. */
  readonly group: CategoryGroup | null;
  readonly label: string;
  readonly siblings: readonly CategoryNames[];
  /** Valores al empezar, para no guardar si no cambia nada; `null` en un alta. */
  readonly original: RowModel | null;
  /** La principal no tenía color: si no se toca el selector, sigue sin él. */
  readonly colorless: boolean;
  /** Dónde vuelve el foco al terminar. */
  readonly returnFocusTo: string;
  /** El idioma en que estaba escrito el nombre: lo sigue estando si no se borra. */
  readonly sourceLanguage: string | null;
  /** Nombres en idiomas que ya no tiene la interfaz: se conservan al guardar. */
  readonly otherTranslations: CategoryTranslations;
}

const t = TEXTS.categories;

/** Lo que enseña el selector de color de una principal que aún no tiene ninguno. */
const NO_COLOR = '#9e9e9e';

/**
 * Configuración › Categorías (T4.1). Arriba se dan de alta las categorías principales, con su
 * color; en la tabla se añaden sus subcategorías, con su tipo, y se edita o elimina cualquiera.
 */
@Component({
  selector: 'app-categories-page',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    FormField,
    FormRoot,
    InfoButton,
    MatButtonModule,
    MatIconModule,
    NgTemplateOutlet,
    TranslatableInput,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  protected readonly texts = TEXTS;
  protected readonly db = inject(DbService);
  private readonly dialog = inject(MatDialog);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly kinds = CATEGORY_KINDS;
  /** En móvil la columna del tipo no cabe: el tipo va con el nombre. */
  protected readonly compact = inject(Viewport).compact;

  private readonly tree = resource({
    params: () => (this.db.ready() ? { version: this.db.dataVersion() } : undefined),
    loader: ({ abortSignal }) => this.db.categoryTree(abortSignal),
  });

  /** Conserva la lista anterior mientras se recarga tras un cambio, para que no parpadee. */
  protected readonly groups = linkedSignal<
    readonly CategoryGroup[] | undefined,
    readonly CategoryGroup[]
  >({
    source: () => this.tree.value(),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  protected readonly cards = computed(() => toCards(this.groups(), language()));

  protected readonly error = signal<string | null>(null);
  /** Último cambio guardado, para anunciarlo. */
  protected readonly notice = signal<string | null>(null);

  // --- Alta de una categoría principal ---

  private readonly model = signal({
    color: CATEGORY_COLORS[0] as string,
    translations: emptyTranslations(),
  });

  protected readonly categoryForm = form(
    this.model,
    (path) => validateNames(path.translations, () => this.groups()),
    { submission: { action: () => this.save(), onInvalid: () => this.attempted.set(true) } },
  );

  /** Se ha intentado guardar el alta con un nombre que no vale. */
  private readonly attempted = signal(false);

  /** En qué idioma se escribe el nombre (ADR-0030); `null`, en el de la interfaz. */
  protected readonly newNameLanguage = signal<Language | null>(null);
  protected readonly attemptedNew = this.attempted.asReadonly();

  // --- Edición en la tabla ---

  protected readonly editor = signal<RowEditor | null>(null);
  private readonly rowModel = signal<RowModel>({
    kind: 'gasto',
    color: NO_COLOR,
    translations: emptyTranslations(),
  });

  protected readonly rowForm = form(
    this.rowModel,
    (path) => validateNames(path.translations, () => this.editor()?.siblings ?? []),
    { submission: { action: () => this.saveRow(), onInvalid: () => this.rowAttempted.set(true) } },
  );

  private readonly rowAttempted = signal(false);
  protected readonly attemptedRow = this.rowAttempted.asReadonly();
  protected readonly rowNameLanguage = signal<Language | null>(null);

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
    // Mientras el usuario no elija color, se propone uno que aún no use ninguna categoría.
    effect(() => {
      const next = nextCategoryColor(this.groups().map((group) => group.color));
      untracked(() => {
        const color = this.categoryForm.color();
        if (!color.dirty()) color.value.set(next);
      });
    });
  }

  protected isEditing(row: CategoryRow): boolean {
    return this.editor()?.id === row.id;
  }

  /** Se está añadiendo una subcategoría a `group`. */
  protected isAddingTo(group: CategoryGroup): boolean {
    const editor = this.editor();
    return editor?.id === null && editor.group?.id === group.id;
  }

  protected edit(row: CategoryRow): void {
    // El nombre de origen va en el campo de su idioma, como uno más.
    const names = { ...row.translations, [row.sourceLanguage]: row.sourceName };
    const original: RowModel = {
      kind: row.kind ?? 'gasto',
      color: row.color ?? NO_COLOR,
      translations: translationsModel(names),
    };
    this.openEditor(original, {
      id: row.id,
      group: row.group,
      label: row.label,
      siblings: row.siblings,
      original,
      colorless: row.color === null,
      returnFocusTo: `#edit-${row.id}`,
      sourceLanguage: row.sourceLanguage,
      otherTranslations: Object.fromEntries(
        Object.entries(names).filter(([code]) => !LANGUAGES.some((option) => option.code === code)),
      ),
    });
  }

  /** Abre una fila nueva al final de `group`; propone el tipo de su última subcategoría. */
  protected addSubcategory(group: CategoryGroup): void {
    this.openEditor(
      {
        kind: group.subcategories.at(-1)?.kind ?? 'gasto',
        color: NO_COLOR,
        translations: emptyTranslations(),
      },
      {
        id: null,
        group,
        label: `${t.newSubcategoryOf} ${group.name}`,
        siblings: group.subcategories,
        original: null,
        colorless: false,
        returnFocusTo: `#add-${group.id}`,
        sourceLanguage: null,
        otherTranslations: {},
      },
    );
  }

  protected cancelEdit(): void {
    const editor = this.editor();
    this.editor.set(null);
    if (editor) this.focusAfterRender(editor.returnFocusTo);
  }

  /** Pide confirmación antes de eliminar: los movimientos de la categoría quedan sin ella. */
  protected remove(row: CategoryRow): void {
    const data: ConfirmDialogData = {
      title: `${t.deleteQuestion} «${row.label}»?`,
      lines: [
        ...(row.subcategoryCount > 0 ? [`${t.deleteSubcategories} ${row.subcategoryCount}.`] : []),
        row.count > 0 ? `${t.deleteUsed} ${row.count}. ${t.deleteConsequence}` : t.deleteUnused,
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
        if (confirmed) void this.delete(row);
      });
  }

  /** Sube (`-1`) o baja (`1`) una fila entre sus hermanas; el foco se queda en la flecha. */
  protected async move(row: CategoryRow, step: -1 | 1): Promise<void> {
    if (!(await this.reorder(row, row.position + step))) return;
    const [same, other] = step < 0 ? ['up', 'down'] : ['down', 'up'];
    this.afterRender(() => {
      const find = (dir: string | undefined) =>
        this.host.nativeElement.querySelector<HTMLButtonElement>(`#${dir}-${row.id}`);
      const button = find(same);
      (button && !button.disabled ? button : find(other))?.focus();
    });
  }

  /** Se ha soltado una categoría principal en otra posición. */
  protected dropGroup(event: CdkDragDrop<unknown>): void {
    const row = this.cards()[event.previousIndex]?.row;
    if (row) void this.reorder(row, event.currentIndex);
  }

  /** Se ha soltado una subcategoría: la lista de cada categoría es aparte, no sale de ella. */
  protected dropSubcategory(card: CategoryCard, event: CdkDragDrop<unknown>): void {
    const row = card.rows[event.previousIndex];
    if (row) void this.reorder(row, event.currentIndex);
  }

  /**
   * Lleva la fila a la posición `to` entre sus hermanas. La lista cambia en el acto, para que
   * la fila no vuelva a su sitio mientras se guarda; si no se puede guardar, se recarga.
   */
  private async reorder(row: CategoryRow, to: number): Promise<boolean> {
    const parentId = row.group?.id ?? null;
    const groups = this.groups();
    const siblings =
      parentId === null ? groups : (groups.find((g) => g.id === parentId)?.subcategories ?? []);
    const ids = moveItem(
      siblings.map((sibling) => sibling.id),
      row.position,
      to,
    );
    if (ids.indexOf(row.id) === row.position) return false;

    this.groups.set(
      parentId === null
        ? inOrder(groups, ids)
        : groups.map((g) =>
            g.id === parentId ? { ...g, subcategories: inOrder(g.subcategories, ids) } : g,
          ),
    );
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.db.reorderCategories({ parentId, ids });
    } catch (error) {
      const code = categoryErrorCode(error);
      this.error.set(code ? t.errors[code] : t.reorderError);
      this.tree.reload();
      return false;
    }
    const position = `${t.position} ${ids.indexOf(row.id) + 1} ${t.positionOf} ${ids.length}`;
    this.notice.set(`${t.moved} ${row.label}, ${position}`);
    return true;
  }

  private openEditor(model: RowModel, editor: RowEditor): void {
    this.editor.set(editor);
    this.rowForm().reset(model);
    this.rowAttempted.set(false);
    this.rowNameLanguage.set(null);
    this.focusAfterRender('#row-name');
  }

  private async save(): Promise<TreeValidationResult> {
    const { color } = this.model();
    // El nombre es del idioma de la interfaz o, si no se ha escrito en él, del primero escrito.
    const names = sourcedNames(filledTranslations(this.model().translations), [language()]);
    if (!names) return undefined;
    const { language: sourceLanguage, name, translations } = names;

    this.error.set(null);
    this.notice.set(null);
    try {
      await this.db.createCategory({
        parentId: null,
        name,
        language: sourceLanguage,
        color,
        translations,
      });
    } catch (error) {
      const code = categoryErrorCode(error);
      if (code) {
        return { kind: code, message: t.errors[code], fieldTree: this.categoryForm.translations };
      }
      this.error.set(t.saveError);
      return undefined;
    }
    this.notice.set(`${t.added} ${shownName(names)}`);
    // Al recargarse la lista se propone el siguiente color libre.
    this.categoryForm().reset({ color, translations: emptyTranslations() });
    this.attempted.set(false);
    this.newNameLanguage.set(null);
    this.focusAfterRender('#new-name');
    return undefined;
  }

  private async saveRow(): Promise<TreeValidationResult> {
    const editor = this.editor();
    if (!editor) return undefined;
    const { kind, color } = this.rowModel();
    // Sigue en el idioma en que estaba escrito si no se ha borrado; si no, como en un alta.
    const names = sourcedNames(
      filledTranslations(this.rowModel().translations),
      editor.sourceLanguage ? [editor.sourceLanguage, language()] : [language()],
    );
    if (!names) return undefined;
    const { language: sourceLanguage, name } = names;
    const translations = { ...editor.otherTranslations, ...names.translations };
    const { original, group } = editor;
    const changed =
      !original ||
      kind !== original.kind ||
      color !== original.color ||
      JSON.stringify(this.rowModel().translations) !== JSON.stringify(original.translations);

    this.error.set(null);
    this.notice.set(null);
    if (changed) {
      const sourced = { name, language: sourceLanguage, translations };
      try {
        if (editor.id === null) {
          if (group) {
            await this.db.createCategory({ parentId: group.id, kind, ...sourced });
          }
        } else if (group) {
          await this.db.updateCategory({ id: editor.id, kind, ...sourced });
        } else {
          const untouched = editor.colorless && color === original?.color;
          await this.db.updateCategory({
            id: editor.id,
            color: untouched ? null : color,
            ...sourced,
          });
        }
      } catch (error) {
        const code = categoryErrorCode(error);
        if (code) {
          return { kind: code, message: t.errors[code], fieldTree: this.rowForm.translations };
        }
        this.error.set(t.saveError);
        return undefined;
      }
      const label = group ? `${group.name} › ${shownName(names)}` : shownName(names);
      this.notice.set(`${editor.id === null ? t.added : t.saved} ${label}`);
    }
    this.cancelEdit();
    return undefined;
  }

  private async delete(row: CategoryRow): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.db.deleteCategory(row.id);
    } catch {
      this.error.set(t.deleteError);
      return;
    }
    this.notice.set(`${t.deleted} ${row.label}`);
    this.editor.set(null);
    // El botón que abrió el diálogo ya no existe: el foco vuelve al título de la lista.
    this.focusAfterRender('#category-list-title');
  }

  private focusAfterRender(selector: string): void {
    this.afterRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }

  private afterRender(callback: () => void): void {
    afterNextRender(callback, { injector: this.injector });
  }
}

function toCards(groups: readonly CategoryGroup[], shown: Language): CategoryCard[] {
  return groups.map((group, position) => ({
    group,
    row: {
      id: group.id,
      name: group.name,
      sourceName: group.sourceName,
      sourceLanguage: group.sourceLanguage,
      translations: group.translations,
      fallback: fallbackOf(group, shown),
      label: group.name,
      group: null,
      kind: null,
      color: group.color,
      count: groupTransactionCount(group),
      subcategoryCount: group.subcategories.length,
      siblings: except(groups, group.id),
      position,
      siblingCount: groups.length,
    },
    rows: group.subcategories.map((subcategory, index) => ({
      id: subcategory.id,
      name: subcategory.name,
      sourceName: subcategory.sourceName,
      sourceLanguage: subcategory.sourceLanguage,
      translations: subcategory.translations,
      fallback: fallbackOf(subcategory, shown),
      label: `${group.name} › ${subcategory.name}`,
      group,
      kind: subcategory.kind,
      color: null,
      count: subcategory.transactionCount,
      subcategoryCount: 0,
      siblings: except(group.subcategories, subcategory.id),
      position: index,
      siblingCount: group.subcategories.length,
    })),
  }));
}

/** Los elementos de `items` en el orden de `ids`. */
function inOrder<T extends { readonly id: number }>(
  items: readonly T[],
  ids: readonly number[],
): T[] {
  return ids.flatMap((id) => items.filter((item) => item.id === id));
}

function except<T extends { readonly id: number }>(items: readonly T[], id: number): T[] {
  return items.filter((item) => item.id !== id);
}

/** Sin nombre en `shown`, el idioma del nombre que se ve en su lugar, el de origen. */
function fallbackOf(
  category: CategoryNames & { readonly sourceLanguage: string },
  shown: Language,
): CategoryRow['fallback'] {
  if (untranslatedLanguages(category, [shown]).length === 0) return null;
  const code = category.sourceLanguage;
  return { code, name: LANGUAGES.find((option) => option.code === code)?.name ?? code };
}

/** El nombre guardado tal como se ve en el idioma de la interfaz. */
function shownName(names: SourcedNames): string {
  return localizedName({ sourceName: names.name, translations: names.translations }, language());
}

/**
 * El nombre tiene que escribirse en algún idioma, y en cada uno no puede coincidir con el de una
 * hermana en ese idioma.
 */
function validateNames(
  path: SchemaPathTree<TranslationsModel>,
  siblings: () => readonly CategoryNames[],
): void {
  validate(path, ({ value }) =>
    Object.values(value()).some((name) => name.trim() !== '')
      ? null
      : { kind: 'nombre-vacio', message: t.errors['nombre-vacio'] },
  );
  for (const { code: language } of LANGUAGES) {
    validate(path[language], ({ value }) => {
      const code = categoryTranslationError(value(), language, siblings());
      return code ? { kind: code, message: t.errors[code] } : null;
    });
  }
}
