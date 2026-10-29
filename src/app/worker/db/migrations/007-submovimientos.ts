import type { Migration } from './migration';

/**
 * Submovimientos (ADR-0019): cualquier movimiento se divide en partes que cuentan cada una en su
 * subcategoría; lo que no se divide se queda en el movimiento. La tabla de reembolsos se
 * reconstruye (SQLite no permite cambiar un `CHECK` ni una clave ajena) y la vista de lo
 * pendiente se rehace:
 *
 * - Una devolución (ADR-0021) va a un gasto, a una subcategoría de gasto o a un submovimiento de
 *   gasto, y no exige que el gasto esté compartido: basta con que sea un gasto.
 * - Sale de un ingreso entero (de lo que no ha dividido) o de uno de sus submovimientos
 *   (`reimbursement_split_id`): el Bizum de suministros dividido en luz, agua y gas devuelve cada
 *   factura con su parte.
 * - Lo que un movimiento divide y lo que devuelve con lo no dividido nunca pasa de su importe.
 * - Lo compartido se cobra entero o por submovimientos, nunca de las dos formas.
 */
export const migration007: Migration = {
  version: 7,
  name: 'submovimientos',
  rebuildsTables: true,
  sql: /* sql */ `
CREATE TABLE transaction_splits (
  id                    INTEGER PRIMARY KEY,
  transaction_id        INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  description           TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  category_id           INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  -- Con el signo del movimiento.
  amount_cents          INTEGER NOT NULL CHECK (amount_cents <> 0),
  -- Parte de un gasto compartida con otra persona, como en \`shared_expenses\`.
  shared_person_id      INTEGER REFERENCES people (id) ON DELETE RESTRICT,
  shared_expected_cents INTEGER CHECK (shared_expected_cents > 0),
  CHECK ((shared_person_id IS NULL) = (shared_expected_cents IS NULL)),
  CHECK (shared_expected_cents IS NULL OR shared_expected_cents <= -amount_cents)
) STRICT;

CREATE INDEX ix_transaction_splits_transaction ON transaction_splits (transaction_id);
CREATE INDEX ix_transaction_splits_category ON transaction_splits (category_id);

DROP VIEW shared_expense_status;

CREATE TABLE reimbursements_new (
  id                     INTEGER PRIMARY KEY,
  reimbursement_tx_id    INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  -- Si sale de un submovimiento del ingreso, cuál; NULL = de lo que el ingreso no ha dividido.
  reimbursement_split_id INTEGER REFERENCES transaction_splits (id) ON DELETE CASCADE,
  -- Destino de la parte: un gasto, una subcategoría de gasto o un submovimiento de gasto;
  -- siempre uno solo.
  expense_tx_id          INTEGER REFERENCES transactions (id) ON DELETE CASCADE,
  category_id            INTEGER REFERENCES categories (id) ON DELETE CASCADE,
  expense_split_id       INTEGER REFERENCES transaction_splits (id) ON DELETE CASCADE,
  amount_cents           INTEGER NOT NULL CHECK (amount_cents > 0),
  CHECK ((expense_tx_id IS NOT NULL) + (category_id IS NOT NULL) + (expense_split_id IS NOT NULL) = 1)
) STRICT;

INSERT INTO reimbursements_new (id, reimbursement_tx_id, expense_tx_id, category_id, amount_cents)
SELECT id, reimbursement_tx_id, expense_tx_id, category_id, amount_cents FROM reimbursements;

DROP TABLE reimbursements;
ALTER TABLE reimbursements_new RENAME TO reimbursements;

CREATE INDEX ix_reimbursements_reimbursement ON reimbursements (reimbursement_tx_id);
CREATE INDEX ix_reimbursements_source_split ON reimbursements (reimbursement_split_id);
CREATE INDEX ix_reimbursements_category ON reimbursements (category_id);
CREATE INDEX ix_reimbursements_split ON reimbursements (expense_split_id);
-- Un mismo origen (ingreso o submovimiento suyo) va una sola vez a cada destino.
CREATE UNIQUE INDEX ux_reimbursements_to_expense
  ON reimbursements (expense_tx_id, reimbursement_tx_id, ifnull(reimbursement_split_id, 0))
  WHERE expense_tx_id IS NOT NULL;
CREATE UNIQUE INDEX ux_reimbursements_to_category
  ON reimbursements (category_id, reimbursement_tx_id, ifnull(reimbursement_split_id, 0))
  WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX ux_reimbursements_to_split
  ON reimbursements (expense_split_id, reimbursement_tx_id, ifnull(reimbursement_split_id, 0))
  WHERE expense_split_id IS NOT NULL;

CREATE TRIGGER tg_reimbursements_valid_insert BEFORE INSERT ON reimbursements
BEGIN
  SELECT RAISE(ABORT, 'reembolso: debe ser un ingreso')
  WHERE (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id) <= 0;
  SELECT RAISE(ABORT, 'reembolso: solo se devuelve un gasto')
  WHERE (NEW.expense_tx_id IS NOT NULL
         AND (SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id) >= 0)
     OR (NEW.expense_split_id IS NOT NULL
         AND (SELECT amount_cents FROM transaction_splits WHERE id = NEW.expense_split_id) >= 0);
  SELECT RAISE(ABORT, 'reembolso: el submovimiento debe ser de ese ingreso')
  WHERE NEW.reimbursement_split_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM transaction_splits
                    WHERE id = NEW.reimbursement_split_id
                      AND transaction_id = NEW.reimbursement_tx_id AND amount_cents > 0);
  -- Lo no dividido del ingreso: su importe menos sus submovimientos.
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.reimbursement_split_id IS NULL
    AND NEW.amount_cents
        + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
           WHERE reimbursement_tx_id = NEW.reimbursement_tx_id AND reimbursement_split_id IS NULL)
        + (SELECT ifnull(sum(amount_cents), 0) FROM transaction_splits
           WHERE transaction_id = NEW.reimbursement_tx_id)
        > (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.reimbursement_split_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE reimbursement_split_id = NEW.reimbursement_split_id)
        > (SELECT amount_cents FROM transaction_splits WHERE id = NEW.reimbursement_split_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.expense_tx_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_tx_id = NEW.expense_tx_id)
        > -(SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.expense_split_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_split_id = NEW.expense_split_id)
        > -(SELECT amount_cents FROM transaction_splits WHERE id = NEW.expense_split_id);
  SELECT RAISE(ABORT, 'reembolso: solo se reparte a una subcategoría de gasto')
  WHERE NEW.category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM categories
                    WHERE id = NEW.category_id AND parent_id IS NOT NULL AND kind = 'gasto');
END;

CREATE TRIGGER tg_reimbursements_valid_update BEFORE UPDATE ON reimbursements
BEGIN
  SELECT RAISE(ABORT, 'reembolso: debe ser un ingreso')
  WHERE (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id) <= 0;
  SELECT RAISE(ABORT, 'reembolso: solo se devuelve un gasto')
  WHERE (NEW.expense_tx_id IS NOT NULL
         AND (SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id) >= 0)
     OR (NEW.expense_split_id IS NOT NULL
         AND (SELECT amount_cents FROM transaction_splits WHERE id = NEW.expense_split_id) >= 0);
  SELECT RAISE(ABORT, 'reembolso: el submovimiento debe ser de ese ingreso')
  WHERE NEW.reimbursement_split_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM transaction_splits
                    WHERE id = NEW.reimbursement_split_id
                      AND transaction_id = NEW.reimbursement_tx_id AND amount_cents > 0);
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.reimbursement_split_id IS NULL
    AND NEW.amount_cents
        + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
           WHERE reimbursement_tx_id = NEW.reimbursement_tx_id AND reimbursement_split_id IS NULL
             AND id <> OLD.id)
        + (SELECT ifnull(sum(amount_cents), 0) FROM transaction_splits
           WHERE transaction_id = NEW.reimbursement_tx_id)
        > (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.reimbursement_split_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE reimbursement_split_id = NEW.reimbursement_split_id
                              AND id <> OLD.id)
        > (SELECT amount_cents FROM transaction_splits WHERE id = NEW.reimbursement_split_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.expense_tx_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_tx_id = NEW.expense_tx_id AND id <> OLD.id)
        > -(SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.expense_split_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_split_id = NEW.expense_split_id AND id <> OLD.id)
        > -(SELECT amount_cents FROM transaction_splits WHERE id = NEW.expense_split_id);
  SELECT RAISE(ABORT, 'reembolso: solo se reparte a una subcategoría de gasto')
  WHERE NEW.category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM categories
                    WHERE id = NEW.category_id AND parent_id IS NOT NULL AND kind = 'gasto');
END;

-- Lo dividido más lo que el movimiento devuelve con lo no dividido no pasa de su importe.
CREATE TRIGGER tg_transaction_splits_valid_insert BEFORE INSERT ON transaction_splits
BEGIN
  SELECT RAISE(ABORT, 'submovimiento: tiene el signo del movimiento')
  WHERE NEW.amount_cents * (SELECT amount_cents FROM transactions WHERE id = NEW.transaction_id) < 0;
  SELECT RAISE(ABORT, 'submovimiento: el movimiento ya está compartido entero')
  WHERE NEW.shared_person_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM shared_expenses WHERE transaction_id = NEW.transaction_id);
  SELECT RAISE(ABORT, 'submovimiento: se divide más de lo que hay')
  WHERE abs(NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM transaction_splits
                                WHERE transaction_id = NEW.transaction_id))
        + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
           WHERE reimbursement_tx_id = NEW.transaction_id AND reimbursement_split_id IS NULL)
        > abs((SELECT amount_cents FROM transactions WHERE id = NEW.transaction_id));
END;

CREATE TRIGGER tg_transaction_splits_valid_update BEFORE UPDATE ON transaction_splits
BEGIN
  SELECT RAISE(ABORT, 'submovimiento: no se mueve a otro movimiento')
  WHERE NEW.transaction_id <> OLD.transaction_id;
  SELECT RAISE(ABORT, 'submovimiento: tiene el signo del movimiento')
  WHERE NEW.amount_cents * (SELECT amount_cents FROM transactions WHERE id = NEW.transaction_id) < 0;
  SELECT RAISE(ABORT, 'submovimiento: se divide más de lo que hay')
  WHERE abs(NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM transaction_splits
                                WHERE transaction_id = NEW.transaction_id AND id <> OLD.id))
        + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
           WHERE reimbursement_tx_id = NEW.transaction_id AND reimbursement_split_id IS NULL)
        > abs((SELECT amount_cents FROM transactions WHERE id = NEW.transaction_id));
  SELECT RAISE(ABORT, 'submovimiento: el movimiento ya está compartido entero')
  WHERE NEW.shared_person_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM shared_expenses WHERE transaction_id = NEW.transaction_id);
  -- Sin devoluciones las sumas son NULL y no frenan nada.
  SELECT RAISE(ABORT, 'submovimiento: no puede costar menos de lo devuelto')
  WHERE (SELECT sum(amount_cents) FROM reimbursements WHERE expense_split_id = NEW.id)
        > -NEW.amount_cents;
  SELECT RAISE(ABORT, 'submovimiento: no puede valer menos de lo que devuelve')
  WHERE (SELECT sum(amount_cents) FROM reimbursements WHERE reimbursement_split_id = NEW.id)
        > NEW.amount_cents;
END;

-- Al revés: lo que ya se cobra por submovimientos no se comparte entero.
CREATE TRIGGER tg_shared_expenses_not_split_insert BEFORE INSERT ON shared_expenses
BEGIN
  SELECT RAISE(ABORT, 'gasto compartido: el movimiento tiene submovimientos compartidos')
  WHERE EXISTS (SELECT 1 FROM transaction_splits
                WHERE transaction_id = NEW.transaction_id AND shared_person_id IS NOT NULL);
END;

CREATE TRIGGER tg_shared_expenses_not_split_update BEFORE UPDATE ON shared_expenses
BEGIN
  SELECT RAISE(ABORT, 'gasto compartido: el movimiento tiene submovimientos compartidos')
  WHERE EXISTS (SELECT 1 FROM transaction_splits
                WHERE transaction_id = NEW.transaction_id AND shared_person_id IS NOT NULL);
END;

-- Lo repartido a subcategorías no devuelve ningún gasto concreto: no entra en lo pendiente.
CREATE VIEW shared_expense_status AS
SELECT s.transaction_id,
       s.person_id,
       s.expected_cents,
       ifnull(sum(r.amount_cents), 0)                    AS reimbursed_cents,
       max(s.expected_cents - ifnull(sum(r.amount_cents), 0), 0) AS pending_cents
FROM shared_expenses s
LEFT JOIN reimbursements r ON r.expense_tx_id = s.transaction_id
GROUP BY s.transaction_id;

-- Lo mismo para los submovimientos compartidos; \`transaction_id\` es el movimiento padre.
CREATE VIEW shared_split_status AS
SELECT s.id                                                       AS split_id,
       s.transaction_id,
       s.shared_person_id                                         AS person_id,
       s.shared_expected_cents                                    AS expected_cents,
       ifnull(sum(r.amount_cents), 0)                             AS reimbursed_cents,
       max(s.shared_expected_cents - ifnull(sum(r.amount_cents), 0), 0) AS pending_cents
FROM transaction_splits s
LEFT JOIN reimbursements r ON r.expense_split_id = s.id
WHERE s.shared_person_id IS NOT NULL
GROUP BY s.id;
`,
};
