import type { CategoryTranslations } from '@domain/categories/category-tree';
import type { SqlDb } from '../sql-db';

/**
 * Idioma en que se leen los nombres de las categorías (ADR-0028): un código de la interfaz, o
 * `null` para leer siempre el nombre por defecto.
 */
export type CategoryLanguage = string | null;

/**
 * CTE `localized_categories`: las mismas columnas que `categories`, con `name` en el idioma
 * pedido (su traducción o, si no la tiene, el nombre por defecto) y el nombre por defecto en
 * `default_name`. Va la primera de su `WITH`, así que el idioma es el primer parámetro.
 */
export const LOCALIZED_CATEGORIES = /* sql */ `
  localized_categories AS (
    SELECT c.id, c.parent_id, coalesce(tr.name, c.name) AS name, c.name AS default_name,
           c.kind, c.color, c.sort_order, c.archived
    FROM categories c
    LEFT JOIN category_translations tr ON tr.category_id = c.id AND tr.language = ?
  )`;

/** Las traducciones de todas las categorías, por id. */
export function categoryTranslations(db: SqlDb): Map<number, Record<string, string>> {
  const byCategory = new Map<number, Record<string, string>>();
  for (const row of db.rows(
    'SELECT category_id, language, name FROM category_translations ORDER BY language',
  )) {
    const id = Number(row['category_id']);
    const translations = byCategory.get(id) ?? {};
    translations[String(row['language'])] = String(row['name']);
    byCategory.set(id, translations);
  }
  return byCategory;
}

/** Sustituye todas las traducciones de una categoría por `translations` (ya limpias). */
export function saveCategoryTranslations(
  db: SqlDb,
  categoryId: number,
  translations: CategoryTranslations,
): void {
  db.run('DELETE FROM category_translations WHERE category_id = ?', [categoryId]);
  for (const [language, name] of Object.entries(translations)) {
    db.run('INSERT INTO category_translations (category_id, language, name) VALUES (?, ?, ?)', [
      categoryId,
      language,
      name,
    ]);
  }
}
