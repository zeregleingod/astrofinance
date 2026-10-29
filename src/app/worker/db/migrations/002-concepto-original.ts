import type { Migration } from './migration';

/**
 * Concepto original del banco (ADR-0007). `description` es el concepto que se muestra y que el
 * usuario puede cambiar; `original_description` guarda el del extracto y no se edita nunca.
 * Es `NULL` en los movimientos creados a mano.
 */
export const migration002: Migration = {
  version: 2,
  name: 'concepto-original',
  sql: /* sql */ `
ALTER TABLE transactions
  ADD COLUMN original_description TEXT CHECK (length(original_description) BETWEEN 1 AND 500);

CREATE TRIGGER tg_transactions_original_description_fixed
BEFORE UPDATE OF original_description ON transactions
WHEN OLD.original_description IS NOT NEW.original_description
BEGIN
  SELECT RAISE(ABORT, 'el concepto original del banco no se puede modificar');
END;
`,
};
