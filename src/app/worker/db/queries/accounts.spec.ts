import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { accountErrorCode } from '@domain/accounts/account';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { wrapDatabase, type SqlDb } from '../sql-db';
import {
  accountIdParam,
  accountUpdateParam,
  createAccount,
  deleteAccount,
  listAccounts,
  newAccountParam,
  updateAccount,
} from './accounts';

describe('consultas de cuentas', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const errorCode = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return accountErrorCode(error);
    }
    return undefined;
  };
  const add = (name: string, institution = 'BBVA') => createAccount(db, { name, institution });
  const tx = (id: number, accountId: number) =>
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, origin,
         dedupe_hash)
       VALUES (?, ?, '2026-10-01', -1000, 'COMPRA', 'manual', ?)`,
      [id, accountId, `hash-${id}`.padEnd(16, '0')],
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
  });

  afterEach(() => raw.close());

  it('da de alta una cuenta corriente con su banco y la lista por nombre', () => {
    const nomina = add('  Nómina ', 'Banc Sabadell');
    const ahorro = add('Ahorro', 'ING');
    tx(1, nomina);
    tx(2, nomina);

    expect(listAccounts(db)).toEqual([
      { id: ahorro, name: 'Ahorro', institution: 'ING', ibanLast4: null, transactionCount: 0 },
      {
        id: nomina,
        name: 'Nómina',
        institution: 'Banc Sabadell',
        ibanLast4: null,
        transactionCount: 2,
      },
    ]);
    expect(db.value('SELECT kind FROM accounts WHERE id = ?', [nomina])).toBe('corriente');
  });

  it('no deja dos cuentas con el mismo nombre ni una sin nombre o sin banco', () => {
    add('Nómina');
    expect(errorCode(() => add('NOMINA'))).toBe('nombre-repetido');
    expect(errorCode(() => add(' '))).toBe('nombre-vacio');
    expect(errorCode(() => add('Otra', ' '))).toBe('banco-vacio');
    expect(listAccounts(db)).toHaveLength(1);
  });

  it('renombra una cuenta, también con su propio nombre en otras mayúsculas', () => {
    const id = add('Nómina');
    updateAccount(db, { id, name: 'NÓMINA', institution: 'BBVA' });
    expect(listAccounts(db)[0]?.name).toBe('NÓMINA');

    add('Ahorro');
    expect(errorCode(() => updateAccount(db, { id, name: 'ahorro', institution: 'BBVA' }))).toBe(
      'nombre-repetido',
    );
  });

  it('cambia el banco solo mientras la cuenta no tiene movimientos', () => {
    const id = add('Nómina', 'BBVA');
    updateAccount(db, { id, name: 'Nómina', institution: 'ING' });
    expect(listAccounts(db)[0]?.institution).toBe('ING');

    tx(1, id);
    expect(errorCode(() => updateAccount(db, { id, name: 'Nómina', institution: 'BBVA' }))).toBe(
      'banco-con-movimientos',
    );
    // Renombrarla sí se puede.
    updateAccount(db, { id, name: 'Cuenta nómina', institution: 'ING' });
    expect(listAccounts(db)[0]).toMatchObject({ name: 'Cuenta nómina', institution: 'ING' });
  });

  it('elimina una cuenta vacía, pero no una con movimientos', () => {
    const empty = add('Vacía');
    const used = add('Usada');
    tx(1, used);

    deleteAccount(db, empty);
    expect(errorCode(() => deleteAccount(db, used))).toBe('cuenta-con-movimientos');
    expect(listAccounts(db).map((account) => account.name)).toEqual(['Usada']);
  });

  it('no elimina una cuenta con extractos importados aunque se hayan quitado sus movimientos', () => {
    const id = add('Importada');
    db.run(
      `INSERT INTO import_batches (account_id, bank_profile, file_name, file_sha256, date_from,
         date_to, rows_total, rows_new, rows_duplicate, rows_error)
       VALUES (?, 'bbva', 'extracto.xlsx', ?, '2026-10-01', '2026-10-31', 0, 0, 0, 0)`,
      [id, 'a'.repeat(64)],
    );
    expect(errorCode(() => deleteAccount(db, id))).toBe('cuenta-con-movimientos');
  });

  it('avisa si la cuenta ya no existe', () => {
    expect(errorCode(() => deleteAccount(db, 99))).toBe('cuenta-inexistente');
    expect(errorCode(() => updateAccount(db, { id: 99, name: 'X', institution: 'BBVA' }))).toBe(
      'cuenta-inexistente',
    );
  });

  describe('parámetros', () => {
    it('acepta los de una cuenta', () => {
      expect(newAccountParam({ name: 'Nómina', institution: 'BBVA' })).toEqual({
        name: 'Nómina',
        institution: 'BBVA',
      });
      expect(accountUpdateParam({ id: 3, name: 'Nómina', institution: 'BBVA' })).toEqual({
        id: 3,
        name: 'Nómina',
        institution: 'BBVA',
      });
      expect(accountIdParam({ id: 3 })).toBe(3);
    });

    it('rechaza los que no tienen la forma esperada', () => {
      expect(() => newAccountParam(null)).toThrow(RangeError);
      expect(() => newAccountParam({ name: 1, institution: 'BBVA' })).toThrow(RangeError);
      expect(() => newAccountParam({ name: 'x', institution: 'y'.repeat(501) })).toThrow(
        RangeError,
      );
      expect(() => accountIdParam({ id: 0 })).toThrow(RangeError);
      expect(() => accountIdParam({ id: 1.5 })).toThrow(RangeError);
    });
  });
});
