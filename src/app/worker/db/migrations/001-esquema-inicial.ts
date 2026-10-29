import type { Migration } from './migration';

/**
 * Esquema inicial. Modelo y decisiones en `docs/adr/0005-modelo-de-datos.md`.
 *
 * Convenciones:
 * - Tablas `STRICT`: un importe con decimales no se puede guardar en una columna `INTEGER`.
 * - Importes en céntimos con signo (`*_cents`): negativo = sale dinero, positivo = entra.
 * - Fechas `TEXT` ISO `AAAA-MM-DD` (validadas con `date(x) IS x`); meses `AAAA-MM`.
 * - Valores enumerados en español, como en el dominio.
 * - `PRAGMA foreign_keys = ON` lo activa el ejecutor en cada conexión.
 */
export const migration001: Migration = {
  version: 1,
  name: 'esquema-inicial',
  sql: /* sql */ `
CREATE TABLE meta (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  db_uuid    TEXT    NOT NULL CHECK (length(db_uuid) = 36),
  revision   INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT    NOT NULL
) STRICT;

INSERT INTO meta (id, db_uuid, created_at)
SELECT 1,
       substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-' ||
       substr('89ab', 1 + (abs(random()) % 4), 1) || substr(h, 18, 3) || '-' || substr(h, 21, 12),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (SELECT lower(hex(randomblob(16))) AS h);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 64),
  value TEXT NOT NULL
) STRICT;

CREATE TABLE accounts (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT    NOT NULL COLLATE NOCASE UNIQUE
                                CHECK (length(trim(name)) BETWEEN 1 AND 80),
  institution           TEXT    CHECK (length(institution) <= 80),
  kind                  TEXT    NOT NULL CHECK (kind IN ('corriente', 'ahorro')),
  -- Nunca el IBAN completo ni el titular.
  iban_last4            TEXT    CHECK (iban_last4 GLOB '[0-9][0-9][0-9][0-9]'),
  is_joint              INTEGER NOT NULL DEFAULT 0 CHECK (is_joint IN (0, 1)),
  currency              TEXT    NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date          TEXT    CHECK (date(opening_date) IS opening_date),
  archived              INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Personas con las que se comparten gastos (alias, sin datos personales).
CREATE TABLE people (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
) STRICT;

-- Árbol genérico; la profundidad máxima y la herencia del tipo las valida el dominio (T1.5).
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  parent_id  INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  name       TEXT    NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 60),
  kind       TEXT    NOT NULL CHECK (kind IN ('ingreso', 'gasto', 'neutra')),
  color      TEXT    CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;

CREATE UNIQUE INDEX ux_categories_sibling_name ON categories (ifnull(parent_id, 0), name);

CREATE TABLE rules (
  id               INTEGER PRIMARY KEY,
  name             TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  priority         INTEGER NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  operator         TEXT    NOT NULL CHECK (operator IN ('contiene', 'empieza', 'termina', 'regex')),
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

CREATE INDEX ix_rules_priority ON rules (priority);

-- Solo lotes confirmados: la revisión previa (T6.4) no se persiste.
CREATE TABLE import_batches (
  id             INTEGER PRIMARY KEY,
  account_id     INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  bank_profile   TEXT    NOT NULL CHECK (length(bank_profile) BETWEEN 1 AND 40),
  file_name      TEXT    NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  file_sha256    TEXT    NOT NULL CHECK (length(file_sha256) = 64),
  date_from      TEXT    NOT NULL CHECK (date(date_from) IS date_from),
  date_to        TEXT    NOT NULL CHECK (date(date_to) IS date_to),
  rows_total     INTEGER NOT NULL CHECK (rows_total >= 0),
  rows_new       INTEGER NOT NULL CHECK (rows_new >= 0),
  rows_duplicate INTEGER NOT NULL CHECK (rows_duplicate >= 0),
  rows_error     INTEGER NOT NULL CHECK (rows_error >= 0),
  status         TEXT    NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'revertido')),
  imported_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (date_from <= date_to),
  CHECK (rows_new + rows_duplicate + rows_error = rows_total)
) STRICT;

CREATE TABLE transactions (
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
                                 CHECK (category_source IN ('manual', 'regla', 'ninguna')),
  rule_id                INTEGER REFERENCES rules (id) ON DELETE SET NULL,
  origin                 TEXT    NOT NULL CHECK (origin IN ('importado', 'manual')),
  import_batch_id        INTEGER REFERENCES import_batches (id) ON DELETE RESTRICT,
  dedupe_hash            TEXT    UNIQUE CHECK (length(dedupe_hash) BETWEEN 16 AND 128),
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((category_id IS NULL) = (category_source = 'ninguna')),
  CHECK (rule_id IS NULL OR category_source = 'regla'),
  CHECK ((origin = 'importado') = (import_batch_id IS NOT NULL)),
  CHECK (origin = 'manual' OR dedupe_hash IS NOT NULL)
) STRICT;

CREATE INDEX ix_transactions_account_date ON transactions (account_id, op_date);
CREATE INDEX ix_transactions_period ON transactions (period);
CREATE INDEX ix_transactions_category ON transactions (category_id);
CREATE INDEX ix_transactions_batch ON transactions (import_batch_id);

-- Traspaso entre cuentas propias: las dos patas son movimientos de cuentas distintas.
CREATE TABLE transfers (
  id             INTEGER PRIMARY KEY,
  outgoing_tx_id INTEGER NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  incoming_tx_id INTEGER NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  CHECK (outgoing_tx_id <> incoming_tx_id)
) STRICT;

CREATE TRIGGER tg_transfers_valid_insert BEFORE INSERT ON transfers
BEGIN
  SELECT RAISE(ABORT, 'traspaso: salida negativa y entrada positiva por el mismo importe, en cuentas distintas')
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions o, transactions i
    WHERE o.id = NEW.outgoing_tx_id AND i.id = NEW.incoming_tx_id
      AND o.amount_cents < 0 AND i.amount_cents = -o.amount_cents
      AND o.account_id <> i.account_id
  );
END;

CREATE TRIGGER tg_transfers_valid_update BEFORE UPDATE ON transfers
BEGIN
  SELECT RAISE(ABORT, 'traspaso: salida negativa y entrada positiva por el mismo importe, en cuentas distintas')
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions o, transactions i
    WHERE o.id = NEW.outgoing_tx_id AND i.id = NEW.incoming_tx_id
      AND o.amount_cents < 0 AND i.amount_cents = -o.amount_cents
      AND o.account_id <> i.account_id
  );
END;

-- Gasto pagado por mí del que otra persona debe devolver una parte (importe libre).
CREATE TABLE shared_expenses (
  transaction_id INTEGER PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
  person_id      INTEGER NOT NULL REFERENCES people (id) ON DELETE RESTRICT,
  expected_cents INTEGER NOT NULL CHECK (expected_cents > 0)
) STRICT;

CREATE INDEX ix_shared_expenses_person ON shared_expenses (person_id);

CREATE TRIGGER tg_shared_expenses_valid_insert BEFORE INSERT ON shared_expenses
BEGIN
  SELECT RAISE(ABORT, 'gasto compartido: debe ser un gasto y la parte esperada no puede superarlo')
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = NEW.transaction_id AND t.amount_cents < 0 AND NEW.expected_cents <= -t.amount_cents
  );
END;

CREATE TRIGGER tg_shared_expenses_valid_update BEFORE UPDATE ON shared_expenses
BEGIN
  SELECT RAISE(ABORT, 'gasto compartido: debe ser un gasto y la parte esperada no puede superarlo')
  WHERE NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = NEW.transaction_id AND t.amount_cents < 0 AND NEW.expected_cents <= -t.amount_cents
  );
END;

-- Reparto de un ingreso (Bizum, transferencia) entre los gastos compartidos que devuelve.
CREATE TABLE reimbursements (
  id                  INTEGER PRIMARY KEY,
  expense_tx_id       INTEGER NOT NULL REFERENCES shared_expenses (transaction_id) ON DELETE CASCADE,
  reimbursement_tx_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  UNIQUE (expense_tx_id, reimbursement_tx_id)
) STRICT;

CREATE INDEX ix_reimbursements_reimbursement ON reimbursements (reimbursement_tx_id);

CREATE TRIGGER tg_reimbursements_valid_insert BEFORE INSERT ON reimbursements
BEGIN
  SELECT RAISE(ABORT, 'reembolso: debe ser un ingreso')
  WHERE (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id) <= 0;
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE reimbursement_tx_id = NEW.reimbursement_tx_id)
        > (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_tx_id = NEW.expense_tx_id)
        > -(SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id);
END;

CREATE TRIGGER tg_reimbursements_valid_update BEFORE UPDATE ON reimbursements
BEGIN
  SELECT RAISE(ABORT, 'reembolso: debe ser un ingreso')
  WHERE (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id) <= 0;
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE reimbursement_tx_id = NEW.reimbursement_tx_id AND id <> OLD.id)
        > (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_tx_id = NEW.expense_tx_id AND id <> OLD.id)
        > -(SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id);
END;

CREATE VIEW shared_expense_status AS
SELECT s.transaction_id,
       s.person_id,
       s.expected_cents,
       ifnull(sum(r.amount_cents), 0)                    AS reimbursed_cents,
       max(s.expected_cents - ifnull(sum(r.amount_cents), 0), 0) AS pending_cents
FROM shared_expenses s
LEFT JOIN reimbursements r ON r.expense_tx_id = s.transaction_id
GROUP BY s.transaction_id;

-- Hipoteca, préstamos, financiaciones y aplazamientos. Cuotas mensuales.
CREATE TABLE loans (
  id                 INTEGER PRIMARY KEY,
  name               TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind               TEXT    NOT NULL
                             CHECK (kind IN ('hipoteca', 'prestamo', 'financiacion', 'aplazamiento')),
  lender             TEXT    CHECK (length(lender) <= 80),
  account_id         INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
  category_id        INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  principal_cents    INTEGER CHECK (principal_cents > 0),
  -- TIN en puntos básicos (3,25 % = 325) para no usar decimales.
  annual_rate_bp     INTEGER CHECK (annual_rate_bp BETWEEN 0 AND 10000),
  installment_cents  INTEGER NOT NULL CHECK (installment_cents > 0),
  installments_total INTEGER NOT NULL CHECK (installments_total BETWEEN 1 AND 600),
  first_due_date     TEXT    NOT NULL CHECK (date(first_due_date) IS first_due_date),
  shared_person_id   INTEGER REFERENCES people (id) ON DELETE RESTRICT,
  shared_cents       INTEGER CHECK (shared_cents > 0),
  status             TEXT    NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'terminado', 'cancelado')),
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((shared_person_id IS NULL) = (shared_cents IS NULL)),
  CHECK (shared_cents IS NULL OR shared_cents <= installment_cents)
) STRICT;

-- Cuadro de cuotas; pagada = tiene movimiento. Si el pago se borra, vuelve a pendiente.
CREATE TABLE loan_installments (
  id             INTEGER PRIMARY KEY,
  loan_id        INTEGER NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  number         INTEGER NOT NULL CHECK (number >= 1),
  due_date       TEXT    NOT NULL CHECK (date(due_date) IS due_date),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  transaction_id INTEGER UNIQUE REFERENCES transactions (id) ON DELETE SET NULL,
  UNIQUE (loan_id, number)
) STRICT;

CREATE INDEX ix_loan_installments_due ON loan_installments (due_date);

-- Cargos esperados: suscripciones detectadas (Fase 7) y previstos declarados (IBI, seguros...).
CREATE TABLE recurring_series (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  source                TEXT    NOT NULL CHECK (source IN ('detectada', 'manual')),
  status                TEXT    NOT NULL
                                CHECK (status IN ('sugerida', 'confirmada', 'descartada', 'finalizada')),
  merchant_key          TEXT    CHECK (length(merchant_key) <= 200),
  account_id            INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
  category_id           INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  -- NULL = importe aún desconocido.
  expected_amount_cents INTEGER CHECK (expected_amount_cents <> 0),
  frequency             TEXT    NOT NULL
                                CHECK (frequency IN ('semanal', 'mensual', 'trimestral', 'semestral', 'anual', 'unica')),
  anchor_date           TEXT    NOT NULL CHECK (date(anchor_date) IS anchor_date),
  end_date              TEXT    CHECK (date(end_date) IS end_date),
  confidence_pct        INTEGER CHECK (confidence_pct BETWEEN 0 AND 100),
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_date IS NULL OR end_date >= anchor_date),
  CHECK (source = 'manual' OR merchant_key IS NOT NULL),
  CHECK (source = 'detectada' OR status <> 'sugerida')
) STRICT;

-- Solo se guardan las ocurrencias resueltas; las pendientes se proyectan (T1.9).
CREATE TABLE recurring_occurrences (
  id             INTEGER PRIMARY KEY,
  series_id      INTEGER NOT NULL REFERENCES recurring_series (id) ON DELETE CASCADE,
  due_date       TEXT    NOT NULL CHECK (date(due_date) IS due_date),
  status         TEXT    NOT NULL CHECK (status IN ('cumplida', 'omitida')),
  transaction_id INTEGER UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  UNIQUE (series_id, due_date),
  CHECK ((status = 'cumplida') = (transaction_id IS NOT NULL))
) STRICT;

-- Importe máximo (gasto) u objetivo (ingreso) de una categoría en un mes.
CREATE TABLE budgets (
  category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  period       TEXT    NOT NULL CHECK (date(period || '-01') IS (period || '-01')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  PRIMARY KEY (category_id, period)
) STRICT;
`,
};
