import type { CategoryKind } from '@domain/categories/category-kind';
import {
  CATEGORY_KINDS,
  CategoryError,
  buildCategoryTree,
  categoryNameError,
  isCategoryColor,
  isReorderOf,
  type CategoryGroup,
  type CategoryOrder,
  type CategoryUpdate,
  type NewCategory,
} from '@domain/categories/category-tree';
import type { SqlDb } from '../sql-db';

/** Una categoría y, si es principal, sus subcategorías. Lleva dos veces el mismo id. */
const SELF_AND_CHILDREN = 'SELECT id FROM categories WHERE id = ? OR parent_id = ?';

/**
 * Categorías principales con sus subcategorías, en el orden en que se muestran, y cuántos
 * movimientos usa cada una.
 */
export function categoryTree(db: SqlDb): CategoryGroup[] {
  return buildCategoryTree(
    db
      .rows(
        `SELECT c.id, c.parent_id, c.name, c.kind, c.color,
                (SELECT count(*) FROM transactions t WHERE t.category_id = c.id) AS tx_count
         FROM categories c
         WHERE c.archived = 0
         ORDER BY c.sort_order, c.name`,
      )
      .map((row) => ({
        id: Number(row['id']),
        parentId: row['parent_id'] === null ? null : Number(row['parent_id']),
        name: String(row['name']),
        kind: row['kind'] === null ? null : (String(row['kind']) as CategoryKind),
        color: row['color'] === null ? null : String(row['color']),
        transactionCount: Number(row['tx_count']),
      })),
  );
}

/**
 * Da de alta una categoría principal (con su color) o una subcategoría (con su tipo) al final
 * de sus hermanas y devuelve su id. Lanza `CategoryError` si el nombre no vale o la principal
 * no existe.
 */
export function createCategory(db: SqlDb, input: NewCategory): number {
  return db.transaction(() => {
    if (input.parentId !== null) requireGroup(db, input.parentId);
    requireFreeName(db, input.name, input.parentId, null);

    db.run(
      `INSERT INTO categories (parent_id, name, kind, color, sort_order)
       SELECT ?, ?, ?, ?, coalesce(max(sort_order), 0) + 1 FROM categories WHERE parent_id IS ?`,
      [
        input.parentId,
        input.name.trim(),
        input.parentId === null ? null : input.kind,
        input.parentId === null ? input.color : null,
        input.parentId,
      ],
    );
    return db.lastInsertId();
  });
}

/**
 * Cambia el nombre y, según el nivel, el color (principal) o el tipo (subcategoría). El nombre
 * no puede coincidir con el de una hermana.
 */
export function updateCategory(db: SqlDb, update: CategoryUpdate): undefined {
  return db.transaction(() => {
    const [category] = db.rows('SELECT parent_id FROM categories WHERE id = ? AND archived = 0', [
      update.id,
    ]);
    if (!category) throw new CategoryError('categoria-inexistente');
    const parentId = category['parent_id'] === null ? null : Number(category['parent_id']);
    requireFreeName(db, update.name, parentId, update.id);

    const name = update.name.trim();
    if ('kind' in update) {
      if (parentId === null) throw invalid('kind');
      db.run('UPDATE categories SET name = ?, kind = ? WHERE id = ?', [
        name,
        update.kind,
        update.id,
      ]);
    } else {
      if (parentId !== null) throw invalid('color');
      db.run('UPDATE categories SET name = ?, color = ? WHERE id = ?', [
        name,
        update.color,
        update.id,
      ]);
    }
    return undefined;
  });
}

/**
 * Elimina una categoría y, si es principal, sus subcategorías (ADR-0008). Sus movimientos no se
 * borran: quedan sin categoría. Devuelve cuántos movimientos han quedado sin categoría.
 */
export function deleteCategory(db: SqlDb, id: number): number {
  return db.transaction(() => {
    if (db.value('SELECT 1 FROM categories WHERE id = ?', [id]) === undefined) {
      throw new CategoryError('categoria-inexistente');
    }
    const both = [id, id];
    const affected = Number(
      db.value(
        `SELECT count(*) FROM transactions WHERE category_id IN (${SELF_AND_CHILDREN})`,
        both,
      ),
    );
    db.run(
      `UPDATE transactions
       SET category_id = NULL, category_source = 'ninguna', rule_id = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE category_id IN (${SELF_AND_CHILDREN})`,
      both,
    );
    db.run(
      `UPDATE transaction_splits SET category_id = NULL
       WHERE category_id IN (${SELF_AND_CHILDREN})`,
      both,
    );
    // Una regla sin categoría de destino no clasifica nada.
    db.run(`DELETE FROM rules WHERE category_id IN (${SELF_AND_CHILDREN})`, both);
    db.run(`UPDATE loans SET category_id = NULL WHERE category_id IN (${SELF_AND_CHILDREN})`, both);
    db.run(
      `UPDATE recurring_series SET category_id = NULL
       WHERE category_id IN (${SELF_AND_CHILDREN})`,
      both,
    );
    // Los presupuestos se van con la categoría (`ON DELETE CASCADE`).
    db.run('DELETE FROM categories WHERE parent_id = ?', [id]);
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    return affected;
  });
}

/**
 * Ordena las hermanas de un nivel tal como llegan en `ids`. Deben ser todas y solo ellas: una
 * subcategoría no puede pasar a otra principal. Si la lista no cuadra (p. ej. ha cambiado
 * mientras tanto), lanza `CategoryError` sin tocar nada.
 */
export function reorderCategories(db: SqlDb, order: CategoryOrder): undefined {
  return db.transaction(() => {
    const current = db
      .rows('SELECT id FROM categories WHERE parent_id IS ? AND archived = 0', [order.parentId])
      .map((row) => Number(row['id']));
    if (!isReorderOf(order.ids, current)) throw new CategoryError('orden-desfasado');
    order.ids.forEach((id, index) => {
      db.run('UPDATE categories SET sort_order = ? WHERE id = ?', [index + 1, id]);
    });
    return undefined;
  });
}

/** Solo hay dos niveles: una subcategoría cuelga siempre de una categoría principal. */
function requireGroup(db: SqlDb, id: number): void {
  const found = db.value(
    'SELECT 1 FROM categories WHERE id = ? AND parent_id IS NULL AND archived = 0',
    [id],
  );
  if (found === undefined) throw new CategoryError('principal-inexistente');
}

/** El nombre vale y no lo usa ninguna hermana (sin contar la propia categoría, `selfId`). */
function requireFreeName(
  db: SqlDb,
  name: string,
  parentId: number | null,
  selfId: number | null,
): void {
  const siblings = db
    .rows('SELECT name FROM categories WHERE parent_id IS ? AND id IS NOT ?', [parentId, selfId])
    .map((row) => String(row['name']));
  const error = categoryNameError(name, siblings);
  if (error) throw new CategoryError(error);
}

type Fields = Readonly<Record<string, unknown>>;

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function newCategoryParam(params: unknown): NewCategory {
  const fields = record(params);
  const name = text(fields);
  const parentId = fields['parentId'] ?? null;
  return parentId === null
    ? { parentId: null, name, color: color(fields) }
    : { parentId: positiveId(parentId, 'parentId'), name, kind: kind(fields) };
}

/** Con `kind` es el cambio de una subcategoría; sin él, el de una principal (con `color`). */
export function categoryUpdateParam(params: unknown): CategoryUpdate {
  const fields = record(params);
  const id = positiveId(fields['id'], 'id');
  const name = text(fields);
  return fields['kind'] === undefined
    ? { id, name, color: color(fields) }
    : { id, name, kind: kind(fields) };
}

export function categoryOrderParam(params: unknown): CategoryOrder {
  const fields = record(params);
  const parentId = fields['parentId'] ?? null;
  const ids = fields['ids'];
  if (!Array.isArray(ids)) throw invalid('ids');
  return {
    parentId: parentId === null ? null : positiveId(parentId, 'parentId'),
    ids: ids.map((id: unknown) => positiveId(id, 'ids')),
  };
}

export function categoryIdParam(params: unknown): number {
  return positiveId(record(params)['id'], 'id');
}

function record(value: unknown): Fields {
  if (typeof value !== 'object' || value === null) throw invalid('forma');
  return value as Fields;
}

function text(fields: Fields): string {
  const name = fields['name'];
  if (typeof name !== 'string') throw invalid('name');
  return name;
}

function kind(fields: Fields): CategoryKind {
  const known = CATEGORY_KINDS.find((candidate) => candidate === fields['kind']);
  if (!known) throw invalid('kind');
  return known;
}

function color(fields: Fields): string | null {
  const value = fields['color'] ?? null;
  if (value !== null && !isCategoryColor(value)) throw invalid('color');
  return value;
}

function positiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw invalid(field);
  return Number(value);
}

const invalid = (field: string) => new RangeError(`Categoría no válida (${field}).`);
