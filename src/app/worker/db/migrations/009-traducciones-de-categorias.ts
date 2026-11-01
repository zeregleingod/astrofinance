import type { Migration } from './migration';

/**
 * Nombres de las categorías en cada idioma de la interfaz (ADR-0028). `categories.name` sigue
 * siendo el nombre por defecto, el que se ve en los idiomas sin traducción. Una traducción se va
 * con su categoría.
 */
export const migration009: Migration = {
  version: 9,
  name: 'traducciones-de-categorias',
  sql: /* sql */ `
CREATE TABLE category_translations (
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  -- Código de idioma de la interfaz: 'es', 'en', 'ca'…
  language    TEXT    NOT NULL CHECK (length(language) = 2 AND language GLOB '[a-z][a-z]'),
  name        TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  PRIMARY KEY (category_id, language)
) STRICT, WITHOUT ROWID;
`,
};
