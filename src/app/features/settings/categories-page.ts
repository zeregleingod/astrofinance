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
import { TEXTS } from '@core/i18n/texts';
import { DbService } from '@data/db/db-service';
import type { CategoryKind } from '@domain/categories/category-kind';
import {
  CATEGORY_COLORS,
  CATEGORY_KINDS,
  categoryErrorCode,
  categoryNameError,
  groupTransactionCount,
  moveItem,
  nextCategoryColor,
  type CategoryGroup,
} from '@domain/categories/category-tree';
import { ConfirmDialog, type ConfirmDialogData } from '@shared/confirm-dialog/confirm-dialog';

/** Una categoría principal o subcategoría de la tabla, con lo necesario para editarla o eliminarla. */
interface CategoryRow {
  readonly id: number;
  readonly name: string;
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
  /** Nombres que no puede tomar: los de sus hermanas. */
  readonly siblingNames: readonly string[];
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
  name: string;
  kind: CategoryKind;
  color: string;
}

/** La fila que se está editando en la tabla, o la subcategoría nueva que se está añadiendo. */
interface RowEditor {
  /** `null`: una subcategoría nueva de `group`. */
  readonly id: number | null;
  /** La principal de la subcategoría; `null` si se edita una principal. */
  readonly group: CategoryGroup | null;
  readonly label: string;
  readonly siblingNames: readonly string[];
  /** Valores al empezar, para no guardar si no cambia nada; `null` en un alta. */
  readonly original: RowModel | null;
  /** La principal no tenía color: si no se toca el selector, sigue sin él. */
  readonly colorless: boolean;
  /** Dónde vuelve el foco al terminar. */
  readonly returnFocusTo: string;
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
    MatButtonModule,
    MatIconModule,
    NgTemplateOutlet,
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

  protected readonly cards = computed(() => toCards(this.groups()));

  protected readonly error = signal<string | null>(null);
  /** Último cambio guardado, para anunciarlo. */
  protected readonly notice = signal<string | null>(null);

  // --- Alta de una categoría principal ---

  private readonly model = signal({ name: '', color: CATEGORY_COLORS[0] as string });

  protected readonly categoryForm = form(
    this.model,
    (path) => {
      validate(path.name, ({ value }) => {
        const names = this.groups().map((group) => group.name);
        const code = categoryNameError(value(), names);
        return code ? { kind: code, message: t.errors[code] } : null;
      });
    },
    { submission: { action: () => this.save(), onInvalid: () => this.attempted.set(true) } },
  );

  /** Se ha intentado guardar el alta con un nombre que no vale. */
  private readonly attempted = signal(false);

  /** El error del nombre no se enseña por pasar por el campo vacío: solo al escribir o guardar. */
  protected readonly showNameError = computed(() => {
    const name = this.categoryForm.name();
    return name.invalid() && (name.dirty() || this.attempted());
  });

  // --- Edición en la tabla ---

  protected readonly editor = signal<RowEditor | null>(null);
  private readonly rowModel = signal<RowModel>({ name: '', kind: 'gasto', color: NO_COLOR });

  protected readonly rowForm = form(
    this.rowModel,
    (path) => {
      validate(path.name, ({ value }) => {
        const code = categoryNameError(value(), this.editor()?.siblingNames ?? []);
        return code ? { kind: code, message: t.errors[code] } : null;
      });
    },
    { submission: { action: () => this.saveRow(), onInvalid: () => this.rowAttempted.set(true) } },
  );

  private readonly rowAttempted = signal(false);

  protected readonly showRowError = computed(() => {
    const name = this.rowForm.name();
    return name.invalid() && (name.dirty() || this.rowAttempted());
  });

  constructor() {
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
    const original: RowModel = {
      name: row.name,
      kind: row.kind ?? 'gasto',
      color: row.color ?? NO_COLOR,
    };
    this.openEditor(original, {
      id: row.id,
      group: row.group,
      label: row.label,
      siblingNames: row.siblingNames,
      original,
      colorless: row.color === null,
      returnFocusTo: `#edit-${row.id}`,
    });
  }

  /** Abre una fila nueva al final de `group`; propone el tipo de su última subcategoría. */
  protected addSubcategory(group: CategoryGroup): void {
    this.openEditor(
      { name: '', kind: group.subcategories.at(-1)?.kind ?? 'gasto', color: NO_COLOR },
      {
        id: null,
        group,
        label: `${t.newSubcategoryOf} ${group.name}`,
        siblingNames: group.subcategories.map((subcategory) => subcategory.name),
        original: null,
        colorless: false,
        returnFocusTo: `#add-${group.id}`,
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
    this.afterRender(() => this.rowForm.name().focusBoundControl());
  }

  private async save(): Promise<TreeValidationResult> {
    const { name, color } = this.model();

    this.error.set(null);
    this.notice.set(null);
    try {
      await this.db.createCategory({ parentId: null, name, color });
    } catch (error) {
      const code = categoryErrorCode(error);
      if (code) return { kind: code, message: t.errors[code], fieldTree: this.categoryForm.name };
      this.error.set(t.saveError);
      return undefined;
    }
    this.notice.set(`${t.added} ${name.trim()}`);
    // Al recargarse la lista se propone el siguiente color libre.
    this.categoryForm().reset({ name: '', color });
    this.attempted.set(false);
    this.categoryForm.name().focusBoundControl();
    return undefined;
  }

  private async saveRow(): Promise<TreeValidationResult> {
    const editor = this.editor();
    if (!editor) return undefined;
    const { kind, color } = this.rowModel();
    const name = this.rowModel().name.trim();
    const { original, group } = editor;
    const changed =
      !original || name !== original.name || kind !== original.kind || color !== original.color;

    this.error.set(null);
    this.notice.set(null);
    if (changed) {
      try {
        if (editor.id === null) {
          if (group) await this.db.createCategory({ parentId: group.id, name, kind });
        } else if (group) {
          await this.db.updateCategory({ id: editor.id, name, kind });
        } else {
          const untouched = editor.colorless && color === original?.color;
          await this.db.updateCategory({ id: editor.id, name, color: untouched ? null : color });
        }
      } catch (error) {
        const code = categoryErrorCode(error);
        if (code) return { kind: code, message: t.errors[code], fieldTree: this.rowForm.name };
        this.error.set(t.saveError);
        return undefined;
      }
      const label = group ? `${group.name} › ${name}` : name;
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

function toCards(groups: readonly CategoryGroup[]): CategoryCard[] {
  return groups.map((group, position) => ({
    group,
    row: {
      id: group.id,
      name: group.name,
      label: group.name,
      group: null,
      kind: null,
      color: group.color,
      count: groupTransactionCount(group),
      subcategoryCount: group.subcategories.length,
      siblingNames: namesExcept(groups, group.id),
      position,
      siblingCount: groups.length,
    },
    rows: group.subcategories.map((subcategory, index) => ({
      id: subcategory.id,
      name: subcategory.name,
      label: `${group.name} › ${subcategory.name}`,
      group,
      kind: subcategory.kind,
      color: null,
      count: subcategory.transactionCount,
      subcategoryCount: 0,
      siblingNames: namesExcept(group.subcategories, subcategory.id),
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

function namesExcept(items: readonly { id: number; name: string }[], id: number): string[] {
  return items.filter((item) => item.id !== id).map((item) => item.name);
}
