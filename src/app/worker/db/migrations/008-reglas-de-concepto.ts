import type { Migration } from './migration';

/**
 * Reglas de concepto (ADR-0024): cambian el concepto que se ve, nunca el del banco.
 * `transactions.description_source` dice de dónde sale el que se ve, para que las reglas no
 * pisen lo que escribe el usuario. Los movimientos cuyo concepto ya no es el del banco (o que no
 * tienen concepto del banco) se dan por escritos a mano.
 */
export const migration008: Migration = {
  version: 8,
  name: 'reglas-de-concepto',
  sql: /* sql */ `
CREATE TABLE concept_rules (
  id          INTEGER PRIMARY KEY,
  priority    INTEGER NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  operator    TEXT    NOT NULL CHECK (operator IN ('contiene', 'exacto', 'regex')),
  pattern     TEXT    NOT NULL CHECK (length(pattern) BETWEEN 1 AND 200),
  -- Qué se sustituye: lo que coincide o el concepto entero.
  scope       TEXT    NOT NULL DEFAULT 'coincidencia'
                      CHECK (scope IN ('coincidencia', 'concepto')),
  -- Vacío: lo que coincide se borra.
  replacement TEXT    NOT NULL DEFAULT '' CHECK (length(replacement) <= 200),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX ix_concept_rules_priority ON concept_rules (priority);

ALTER TABLE transactions
  ADD COLUMN description_source TEXT NOT NULL DEFAULT 'banco'
             CHECK (description_source IN ('banco', 'regla', 'manual'));

UPDATE transactions SET description_source = 'manual'
WHERE original_description IS NULL OR description IS NOT original_description;
`,
};
