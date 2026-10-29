import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { allTransactions, monthTransactions } from './reports';

/** Cada movimiento sabe con qué otros está vinculado (ADR-0022). */
describe('movimientos vinculados', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const category = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL', [name]));
  const tx = (id: number, account: number, date: string, cents: number, description: string) =>
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
         category_source, origin)
       VALUES (?, ?, ?, ?, ?, 'ninguna', 'manual')`,
      [id, account, date, cents, description],
    );
  const split = (id: number, parent: number, cents: number, description: string) =>
    db.run(
      `INSERT INTO transaction_splits (id, transaction_id, description, category_id, amount_cents)
       VALUES (?, ?, ?, ?, ?)`,
      [id, parent, description, category('Hogar'), cents],
    );
  const links = (id: number) => allTransactions(db).find((row) => row.id === id)?.links;

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    for (const { sql, bind } of categoryTemplateStatements()) db.run(sql, bind);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (2, 'Hucha', 'ahorro')`);
    // Una cena devuelta entera por un Bizum.
    tx(1, 1, '2026-09-10', -6000, 'CENA');
    tx(2, 1, '2026-09-12', 3000, 'BIZUM ANA');
    db.run(
      `INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents)
       VALUES (1, 2, 3000)`,
    );
  });

  afterEach(() => raw.close());

  it('el gasto enlaza al ingreso que lo devuelve y el ingreso al gasto', () => {
    expect(links(1)).toEqual([
      {
        kind: 'refundedBy',
        transactionId: 2,
        date: '2026-09-12',
        description: 'BIZUM ANA',
        accountName: 'Cuenta',
        amountCents: 3000,
      },
    ]);
    expect(links(2)).toEqual([
      {
        kind: 'refunds',
        transactionId: 1,
        date: '2026-09-10',
        description: 'CENA',
        accountName: 'Cuenta',
        amountCents: 3000,
      },
    ]);
  });

  it('un movimiento sin vínculos no tiene ninguno', () => {
    tx(3, 1, '2026-09-15', -1000, 'PAN');
    expect(links(3)).toEqual([]);
  });

  it('un Bizum dividido enlaza a cada gasto que devuelve, una vez por gasto y por fecha', () => {
    tx(5, 1, '2026-07-03', -4000, 'FACTURA LUZ');
    tx(6, 1, '2026-07-01', -2000, 'FACTURA AGUA');
    tx(7, 1, '2026-07-20', 9000, 'BIZUM SUMINISTROS');
    split(71, 7, 4000, 'LUZ');
    split(72, 7, 2000, 'AGUA');
    db.run(
      `INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, reimbursement_split_id,
         amount_cents)
       VALUES (5, 7, 71, 1500), (5, 7, NULL, 500), (6, 7, 72, 2000)`,
    );
    expect(links(7)?.map((l) => [l.transactionId, l.description, l.amountCents])).toEqual([
      [6, 'FACTURA AGUA', 2000],
      [5, 'FACTURA LUZ', 2000],
    ]);
    expect(links(5)?.map((l) => [l.kind, l.transactionId, l.amountCents])).toEqual([
      ['refundedBy', 7, 2000],
    ]);
  });

  it('lo devuelto a un submovimiento enlaza con el gasto dividido', () => {
    tx(3, 1, '2026-09-01', -10000, 'BAZAR');
    split(31, 3, -6000, 'COJINES');
    tx(4, 1, '2026-09-05', 2000, 'BIZUM SERGIO');
    db.run(
      `INSERT INTO reimbursements (expense_split_id, reimbursement_tx_id, amount_cents)
       VALUES (31, 4, 2000)`,
    );
    expect(links(3)?.map((l) => [l.kind, l.transactionId, l.amountCents])).toEqual([
      ['refundedBy', 4, 2000],
    ]);
    expect(links(4)?.map((l) => [l.kind, l.transactionId, l.amountCents])).toEqual([
      ['refunds', 3, 2000],
    ]);
  });

  it('lo repartido a una subcategoría no enlaza con ningún movimiento', () => {
    tx(3, 1, '2026-09-20', 1000, 'BIZUM VARIOS');
    db.run(
      `INSERT INTO reimbursements (category_id, reimbursement_tx_id, amount_cents)
       VALUES (?, 3, 1000)`,
      [category('Hogar')],
    );
    expect(links(3)).toEqual([]);
  });

  it('cada pata de un traspaso enlaza con la otra', () => {
    tx(8, 1, '2026-07-10', -2000, 'A LA HUCHA');
    tx(9, 2, '2026-07-11', 2000, 'DESDE CUENTA');
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (8, 9)');
    expect(links(8)).toEqual([
      {
        kind: 'transfer',
        transactionId: 9,
        date: '2026-07-11',
        description: 'DESDE CUENTA',
        accountName: 'Hucha',
        amountCents: 2000,
      },
    ]);
    expect(links(9)?.map((l) => [l.kind, l.transactionId, l.accountName, l.amountCents])).toEqual([
      ['transfer', 8, 'Cuenta', -2000],
    ]);
  });

  it('los movimientos de un mes enlazan también con los de otros meses', () => {
    expect(monthTransactions(db, '2026-09').find((row) => row.id === 2)?.links).toHaveLength(1);
    db.run(`UPDATE transactions SET booked_date = '2026-10-01' WHERE id = 2`);
    expect(monthTransactions(db, '2026-09').find((row) => row.id === 1)?.links).toHaveLength(1);
  });
});
