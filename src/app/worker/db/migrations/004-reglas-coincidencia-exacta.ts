import type { Migration } from './migration';

/**
 * Las reglas admiten el operador `exacto`: el concepto entero, no una parte (ADR-0011). SQLite
 * no permite cambiar un `CHECK`, así que la tabla se reconstruye; `transactions.rule_id` sigue
 * apuntando a ella por su nombre.
 */
export const migration004: Migration = {
  version: 4,
  name: 'reglas-coincidencia-exacta',
  rebuildsTables: true,
  sql: /* sql */ `
CREATE TABLE rules_new (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  priority         INTEGER NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  operator         TEXT    NOT NULL
                           CHECK (operator IN ('contiene', 'exacto', 'empieza', 'termina', 'regex')),
  pattern          TEXT    NOT NULL CHECK (length(pattern) BETWEEN 1 AND 200),
  sign             TEXT    NOT NULL DEFAULT 'cualquiera'
                           CHECK (sign IN ('cualquiera', 'ingreso', 'gasto')),
  -- Rango sobre el valor absoluto del importe.
  min_amount_cents INTEGER CHECK (min_amount_cents >= 0),
  max_amount_cents INTEGER CHECK (max_amount_cents >= 0),
  account_id       INTEGER REFERENCES accounts (id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (min_amount_cents IS NULL OR max_amount_cents IS NULL
         OR min_amount_cents <= max_amount_cents)
) STRICT;

INSERT INTO rules_new (id, name, priority, enabled, operator, pattern, sign, min_amount_cents,
                       max_amount_cents, account_id, category_id, created_at)
SELECT id, name, priority, enabled, operator, pattern, sign, min_amount_cents,
       max_amount_cents, account_id, category_id, created_at
FROM rules;

DROP TABLE rules;
ALTER TABLE rules_new RENAME TO rules;

CREATE INDEX ix_rules_priority ON rules (priority);
`,
};
