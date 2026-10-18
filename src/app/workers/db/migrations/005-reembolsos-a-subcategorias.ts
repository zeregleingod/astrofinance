import type { Migration } from './migration';

/**
 * Un reembolso (Bizum, transferencia) se reparte en partes, y cada parte va a un gasto
 * compartido concreto o a una subcategoría de gasto (ADR-0013). SQLite no permite cambiar una
 * columna `NOT NULL`, así que la tabla se reconstruye; la vista de lo pendiente se rehace
 * porque un renombrado no admite vistas que apunten a una tabla que ya no existe.
 */
export const migration005: Migration = {
  version: 5,
  name: 'reembolsos-a-subcategorias',
  rebuildsTables: true,
  sql: /* sql */ `
DROP VIEW shared_expense_status;

CREATE TABLE reimbursements_new (
  id                  INTEGER PRIMARY KEY,
  reimbursement_tx_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  -- Destino de la parte: un gasto compartido o una subcategoría de gasto, nunca los dos.
  expense_tx_id       INTEGER REFERENCES shared_expenses (transaction_id) ON DELETE CASCADE,
  category_id         INTEGER REFERENCES categories (id) ON DELETE CASCADE,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  CHECK ((expense_tx_id IS NULL) <> (category_id IS NULL)),
  UNIQUE (expense_tx_id, reimbursement_tx_id),
  UNIQUE (category_id, reimbursement_tx_id)
) STRICT;

INSERT INTO reimbursements_new (id, reimbursement_tx_id, expense_tx_id, amount_cents)
SELECT id, reimbursement_tx_id, expense_tx_id, amount_cents FROM reimbursements;

DROP TABLE reimbursements;
ALTER TABLE reimbursements_new RENAME TO reimbursements;

CREATE INDEX ix_reimbursements_reimbursement ON reimbursements (reimbursement_tx_id);
CREATE INDEX ix_reimbursements_category ON reimbursements (category_id);

CREATE TRIGGER tg_reimbursements_valid_insert BEFORE INSERT ON reimbursements
BEGIN
  SELECT RAISE(ABORT, 'reembolso: debe ser un ingreso')
  WHERE (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id) <= 0;
  SELECT RAISE(ABORT, 'reembolso: se asigna más de lo recibido')
  WHERE NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE reimbursement_tx_id = NEW.reimbursement_tx_id)
        > (SELECT amount_cents FROM transactions WHERE id = NEW.reimbursement_tx_id);
  SELECT RAISE(ABORT, 'reembolso: se devuelve más de lo gastado')
  WHERE NEW.expense_tx_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_tx_id = NEW.expense_tx_id)
        > -(SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id);
  SELECT RAISE(ABORT, 'reembolso: solo se reparte a una subcategoría de gasto')
  WHERE NEW.category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM categories
                    WHERE id = NEW.category_id AND parent_id IS NOT NULL AND kind = 'gasto');
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
  WHERE NEW.expense_tx_id IS NOT NULL
    AND NEW.amount_cents + (SELECT ifnull(sum(amount_cents), 0) FROM reimbursements
                            WHERE expense_tx_id = NEW.expense_tx_id AND id <> OLD.id)
        > -(SELECT amount_cents FROM transactions WHERE id = NEW.expense_tx_id);
  SELECT RAISE(ABORT, 'reembolso: solo se reparte a una subcategoría de gasto')
  WHERE NEW.category_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM categories
                    WHERE id = NEW.category_id AND parent_id IS NOT NULL AND kind = 'gasto');
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
`,
};
