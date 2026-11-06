import {
  AccountError,
  accountError,
  cleanAccount,
  type AccountRow,
  type AccountUpdate,
  type NewAccount,
} from '@domain/accounts/account';
import type { SqlDb } from '../sql-db';

/** Las cuentas por nombre, con cuántos movimientos tiene cada una. */
export function listAccounts(db: SqlDb): AccountRow[] {
  return db
    .rows(
      `SELECT a.id, a.name, a.institution, a.iban_last4,
              (SELECT count(*) FROM transactions t WHERE t.account_id = a.id) AS transaction_count
       FROM accounts a
       ORDER BY a.name COLLATE NOCASE, a.id`,
    )
    .map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      institution: row['institution'] === null ? null : String(row['institution']),
      ibanLast4: row['iban_last4'] === null ? null : String(row['iban_last4']),
      transactionCount: Number(row['transaction_count']),
    }));
}

/** Da de alta una cuenta corriente y devuelve su id. */
export function createAccount(db: SqlDb, input: NewAccount): number {
  return db.transaction(() => {
    const account = requireValid(db, input, null);
    db.run(`INSERT INTO accounts (name, institution, kind) VALUES (?, ?, 'corriente')`, [
      account.name,
      account.institution,
    ]);
    return db.lastInsertId();
  });
}

/**
 * Renombra la cuenta o le cambia el banco. El banco solo cambia mientras no tenga movimientos:
 * con él se reconocen sus extractos al importar.
 */
export function updateAccount(db: SqlDb, update: AccountUpdate): undefined {
  return db.transaction(() => {
    const current = requireAccount(db, update.id);
    const account = requireValid(db, update, update.id);
    if (account.institution !== current.institution && inUse(db, update.id)) {
      throw new AccountError('banco-con-movimientos');
    }
    db.run('UPDATE accounts SET name = ?, institution = ? WHERE id = ?', [
      account.name,
      account.institution,
      update.id,
    ]);
    return undefined;
  });
}

/** Elimina la cuenta, solo si no tiene nada: ni movimientos ni extractos importados. */
export function deleteAccount(db: SqlDb, id: number): undefined {
  return db.transaction(() => {
    requireAccount(db, id);
    if (inUse(db, id)) throw new AccountError('cuenta-con-movimientos');
    try {
      db.run('DELETE FROM accounts WHERE id = ?', [id]);
    } catch {
      // Otra tabla (préstamos, recibos) la usa: la clave ajena lo impide.
      throw new AccountError('cuenta-con-movimientos');
    }
    return undefined;
  });
}

function inUse(db: SqlDb, id: number): boolean {
  return (
    db.value(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM transactions WHERE account_id = ?)
                   OR EXISTS (SELECT 1 FROM import_batches WHERE account_id = ?)`,
      [id, id],
    ) !== undefined
  );
}

function requireAccount(db: SqlDb, id: number): { institution: string | null } {
  const [row] = db.rows('SELECT institution FROM accounts WHERE id = ?', [id]);
  if (!row) throw new AccountError('cuenta-inexistente');
  return { institution: row['institution'] === null ? null : String(row['institution']) };
}

/** Comprueba la cuenta contra las demás (sin contar `selfId`) y la devuelve tal como se guarda. */
function requireValid<T extends NewAccount>(db: SqlDb, input: T, selfId: number | null): T {
  const others = db
    .rows('SELECT name FROM accounts WHERE id IS NOT ?', [selfId])
    .map((row) => ({ name: String(row['name']) }));
  const account = cleanAccount(input);
  const error = accountError(account, others);
  if (error) throw new AccountError(error);
  return account;
}

type Fields = Readonly<Record<string, unknown>>;

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function newAccountParam(params: unknown): NewAccount {
  const { name, institution } = record(params);
  if (typeof name !== 'string' || name.length > 500) throw invalid('name');
  if (typeof institution !== 'string' || institution.length > 500) throw invalid('institution');
  return { name, institution };
}

export function accountUpdateParam(params: unknown): AccountUpdate {
  return { ...newAccountParam(params), id: accountIdParam(params) };
}

export function accountIdParam(params: unknown): number {
  const id = record(params)['id'];
  if (!Number.isSafeInteger(id) || Number(id) <= 0) throw invalid('id');
  return Number(id);
}

function record(value: unknown): Fields {
  if (typeof value !== 'object' || value === null) throw invalid('forma');
  return value as Fields;
}

const invalid = (field: string) => new RangeError(`Cuenta no válida (${field}).`);
