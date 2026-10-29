import type { Migration } from './migration';

/**
 * Nuevo origen de la categoría, `sugerencia`: la propone el historial al importar y el usuario
 * la acepta al guardar (ADR-0018). Como lo de una regla, no es una decisión a mano: las reglas
 * pueden cambiarla después. SQLite no permite cambiar un `CHECK`, así que la tabla se
 * reconstruye con las mismas columnas, índices y disparador. Las tablas que la referencian
 * siguen escribiendo `transactions` en sus claves ajenas y disparadores, así que valen tal cual
 * para la tabla nueva en cuanto toma ese nombre.
 */
export const migration006: Migration = {
  version: 6,
  name: 'categoria-sugerida',
  rebuildsTables: true,
  sql: /* sql */ `
CREATE TABLE transactions_new (
  id                     INTEGER PRIMARY KEY,
  account_id             INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  op_date                TEXT    NOT NULL CHECK (date(op_date) IS op_date),
  value_date             TEXT    CHECK (date(value_date) IS value_date),
  -- Fecha imputada que fija el usuario cuando el movimiento no pertenece a la fecha original
  -- (p. ej. el Bizum de marzo que devuelve un gasto de febrero). NULL = la de op_date.
  booked_date            TEXT    CHECK (date(booked_date) IS booked_date),
  period                 TEXT    NOT NULL
                                 GENERATED ALWAYS AS (substr(coalesce(booked_date, op_date), 1, 7)) STORED,
  amount_cents           INTEGER NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents    INTEGER,
  description            TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  normalized_description TEXT    NOT NULL DEFAULT '' CHECK (length(normalized_description) <= 500),
  merchant               TEXT    CHECK (length(merchant) <= 200),
  note                   TEXT    CHECK (length(note) <= 500),
  bank_reference         TEXT    CHECK (length(bank_reference) <= 100),
  category_id            INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  category_source        TEXT    NOT NULL DEFAULT 'ninguna'
                                 CHECK (category_source IN ('manual', 'regla', 'sugerencia', 'ninguna')),
  rule_id                INTEGER REFERENCES rules (id) ON DELETE SET NULL,
  origin                 TEXT    NOT NULL CHECK (origin IN ('importado', 'manual')),
  import_batch_id        INTEGER REFERENCES import_batches (id) ON DELETE RESTRICT,
  dedupe_hash            TEXT    UNIQUE CHECK (length(dedupe_hash) BETWEEN 16 AND 128),
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  original_description   TEXT    CHECK (length(original_description) BETWEEN 1 AND 500),
  CHECK ((category_id IS NULL) = (category_source = 'ninguna')),
  CHECK (rule_id IS NULL OR category_source = 'regla'),
  CHECK ((origin = 'importado') = (import_batch_id IS NOT NULL)),
  CHECK (origin = 'manual' OR dedupe_hash IS NOT NULL)
) STRICT;

INSERT INTO transactions_new (id, account_id, op_date, value_date, booked_date, amount_cents,
  balance_after_cents, description, normalized_description, merchant, note, bank_reference,
  category_id, category_source, rule_id, origin, import_batch_id, dedupe_hash, created_at,
  updated_at, original_description)
SELECT id, account_id, op_date, value_date, booked_date, amount_cents, balance_after_cents,
  description, normalized_description, merchant, note, bank_reference, category_id,
  category_source, rule_id, origin, import_batch_id, dedupe_hash, created_at, updated_at,
  original_description
FROM transactions;

DROP TABLE transactions;
-- Sin el modo antiguo, el renombrado revisa los disparadores de las demás tablas y falla con
-- los que leen \`transactions\`, que en este momento no existe.
PRAGMA legacy_alter_table = ON;
ALTER TABLE transactions_new RENAME TO transactions;
PRAGMA legacy_alter_table = OFF;

CREATE INDEX ix_transactions_account_date ON transactions (account_id, op_date);
CREATE INDEX ix_transactions_period ON transactions (period);
CREATE INDEX ix_transactions_category ON transactions (category_id);
CREATE INDEX ix_transactions_batch ON transactions (import_batch_id);

CREATE TRIGGER tg_transactions_original_description_fixed
BEFORE UPDATE OF original_description ON transactions
WHEN OLD.original_description IS NOT NEW.original_description
BEGIN
  SELECT RAISE(ABORT, 'el concepto original del banco no se puede modificar');
END;
`,
};
