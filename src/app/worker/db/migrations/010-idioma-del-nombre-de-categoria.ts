import type { Migration } from './migration';

/**
 * `categories.name` deja de ser un nombre «por defecto» sin idioma (ADR-0030): es el nombre en
 * `categories.language`, el idioma en que se escribió, y el que se ve en los idiomas sin
 * traducción. Las traducciones a ese idioma sobran.
 *
 * Las categorías ya guardadas se escribieron en español, salvo que ya tengan traducción al
 * español: entonces su nombre es del primer idioma, en el orden de la interfaz, que no traducen.
 * Si los traducen todos, su nombre no se veía en ninguno y pasa a ser el español.
 */
export const migration010: Migration = {
  version: 10,
  name: 'idioma-del-nombre-de-categoria',
  sql: /* sql */ `
ALTER TABLE categories ADD COLUMN
  language TEXT NOT NULL DEFAULT 'es' CHECK (length(language) = 2 AND language GLOB '[a-z][a-z]');

UPDATE categories SET language = CASE
  WHEN NOT EXISTS (SELECT 1 FROM category_translations t
                   WHERE t.category_id = categories.id AND t.language = 'es') THEN 'es'
  WHEN NOT EXISTS (SELECT 1 FROM category_translations t
                   WHERE t.category_id = categories.id AND t.language = 'ca') THEN 'ca'
  WHEN NOT EXISTS (SELECT 1 FROM category_translations t
                   WHERE t.category_id = categories.id AND t.language = 'en') THEN 'en'
  ELSE 'es'
END;

-- Las que traducen todos los idiomas: su nombre pasa a ser el español, si no lo usa una hermana.
UPDATE categories
SET name = (SELECT t.name FROM category_translations t
            WHERE t.category_id = categories.id AND t.language = 'es')
WHERE language = 'es'
  AND EXISTS (SELECT 1 FROM category_translations t
              WHERE t.category_id = categories.id AND t.language = 'es')
  AND NOT EXISTS (SELECT 1 FROM categories s, category_translations t
                  WHERE t.category_id = categories.id AND t.language = 'es'
                    AND s.parent_id IS categories.parent_id AND s.id <> categories.id
                    AND s.name = t.name);

DELETE FROM category_translations
WHERE EXISTS (SELECT 1 FROM categories c
              WHERE c.id = category_translations.category_id
                AND c.language = category_translations.language
                AND c.name = category_translations.name);
`,
};
