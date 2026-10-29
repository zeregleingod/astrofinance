import type { Migration } from './migration';

/**
 * El tipo pasa a ser solo de las subcategorías (ADR-0009): las categorías principales agrupan
 * y no tienen tipo. Además el tipo `neutra` pasa a llamarse `ahorro`, que es lo que es.
 * SQLite no permite quitar un `NOT NULL` ni cambiar un `CHECK`, así que la tabla se
 * reconstruye; las claves ajenas de las demás tablas siguen apuntando a ella por su nombre.
 */
export const migration003: Migration = {
  version: 3,
  name: 'categorias-padre-sin-tipo',
  rebuildsTables: true,
  sql: /* sql */ `
CREATE TABLE categories_new (
  id         INTEGER PRIMARY KEY,
  parent_id  INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  name       TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  -- Solo las subcategorías tienen tipo; en las principales es NULL.
  kind       TEXT    CHECK (kind IN ('ingreso', 'gasto', 'ahorro')),
  color      TEXT    CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (parent_id IS NULL OR kind IS NOT NULL)
) STRICT;

INSERT INTO categories_new (id, parent_id, name, kind, color, sort_order, archived)
SELECT id, parent_id, name,
       CASE WHEN parent_id IS NULL THEN NULL WHEN kind = 'neutra' THEN 'ahorro' ELSE kind END,
       color, sort_order, archived
FROM categories;

DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

CREATE UNIQUE INDEX ux_categories_sibling_name ON categories (ifnull(parent_id, 0), name);
`,
};
