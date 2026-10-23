import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { expenseRefundOptions, expenseRefundsParam, saveRefunds } from './refunds';
import { allTransactions, monthReport } from './reports';

describe('devoluciones: vincular ingresos a un gasto', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const category = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL', [name]));
  const tx = (id: number, date: string, cents: number, description: string, account = 1) =>
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, category_id,
         category_source, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [
        id,
        account,
        date,
        cents,
        description,
        cents < 0 ? category('Restaurantes') : null,
        cents < 0 ? 'manual' : 'ninguna',
      ],
    );
  const links = () =>
    db.rows(
      `SELECT reimbursement_tx_id AS id, amount_cents AS cents FROM reimbursements
       WHERE expense_tx_id = 1 ORDER BY reimbursement_tx_id`,
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    for (const { sql, bind } of categoryTemplateStatements()) db.run(sql, bind);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente'),
              (2, 'Hucha', 'ahorro')`);
    // Cena de 120 € el día 10; tres amigos pagan su parte por Bizum.
    tx(1, '2026-09-10', -12000, 'RESTAURANTE LA PLAZA');
    tx(2, '2026-09-11', 3000, 'BIZUM ANA');
    tx(3, '2026-09-12', 3000, 'BIZUM LUIS');
    tx(4, '2026-09-25', 3000, 'BIZUM MARTA');
    tx(5, '2026-06-01', 185000, 'NOMINA');
    tx(6, '2026-09-10', -500, 'OTRO GASTO');
  });

  afterEach(() => raw.close());

  it('ofrece los ingresos con algo libre: primero los posteriores al gasto, del más cercano', () => {
    // Un día antes de la cena: más cerca que Marta, pero las devoluciones llegan después.
    tx(9, '2026-09-09', 1000, 'BIZUM PREVIO');
    const options = expenseRefundOptions(db, 1);
    expect(options.candidates.map((c) => c.description)).toEqual([
      'BIZUM ANA',
      'BIZUM LUIS',
      'BIZUM MARTA',
      'BIZUM PREVIO',
      'NOMINA',
    ]);
    expect(options.candidates[0]).toEqual({
      id: 2,
      splitId: null,
      date: '2026-09-11',
      description: 'BIZUM ANA',
      accountName: 'Cuenta',
      amountCents: 3000,
      availableCents: 3000,
      linkedCents: null,
    });
  });

  it('vincula varios Bizums a la cena: cuentan en su categoría y ella cuesta lo que queda', () => {
    saveRefunds(db, {
      expenseId: 1,
      links: [
        { reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 3000 },
        { reimbursementTxId: 3, reimbursementSplitId: null, amountCents: 3000 },
        { reimbursementTxId: 4, reimbursementSplitId: null, amountCents: 3000 },
      ],
    });

    expect(links()).toEqual([
      { id: 2, cents: 3000 },
      { id: 3, cents: 3000 },
      { id: 4, cents: 3000 },
    ]);
    const restaurants = monthReport(db, '2026-09')
      .groups.flatMap((g) => g.lines)
      .find((l) => l.name === 'Restaurantes');
    expect(restaurants).toMatchObject({ totalCents: -12000 - 500 + 9000, reimbursedCents: 9000 });

    const dinner = allTransactions(db).find((r) => r.id === 1);
    expect(dinner?.refunds).toEqual([
      { transactionId: 2, date: '2026-09-11', description: 'BIZUM ANA', amountCents: 3000 },
      { transactionId: 3, date: '2026-09-12', description: 'BIZUM LUIS', amountCents: 3000 },
      { transactionId: 4, date: '2026-09-25', description: 'BIZUM MARTA', amountCents: 3000 },
    ]);
    expect(dinner?.refundable).toBe(true);
    expect(allTransactions(db).find((r) => r.id === 2)?.reimbursement).toBe(true);
  });

  it('lo vinculado a otro gasto ya no está libre; lo de este gasto se ofrece con su importe', () => {
    saveRefunds(db, {
      expenseId: 6,
      links: [{ reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 500 }],
    });
    saveRefunds(db, {
      expenseId: 1,
      links: [{ reimbursementTxId: 3, reimbursementSplitId: null, amountCents: 1000 }],
    });

    const candidates = expenseRefundOptions(db, 1).candidates;
    expect(candidates.find((c) => c.id === 2)).toMatchObject({
      availableCents: 2500,
      linkedCents: null,
    });
    expect(candidates.find((c) => c.id === 3)).toMatchObject({
      availableCents: 3000,
      linkedCents: 1000,
    });
  });

  it('al volver a guardar cambia, quita y añade, sin tropezar con los límites por el camino', () => {
    saveRefunds(db, {
      expenseId: 1,
      links: [
        { reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 3000 },
        { reimbursementTxId: 5, reimbursementSplitId: null, amountCents: 9000 },
      ],
    });
    saveRefunds(db, {
      expenseId: 1,
      links: [
        { reimbursementTxId: 5, reimbursementSplitId: null, amountCents: 1000 },
        { reimbursementTxId: 3, reimbursementSplitId: null, amountCents: 3000 },
        { reimbursementTxId: 4, reimbursementSplitId: null, amountCents: 3000 },
      ],
    });
    expect(links()).toEqual([
      { id: 3, cents: 3000 },
      { id: 4, cents: 3000 },
      { id: 5, cents: 1000 },
    ]);

    saveRefunds(db, { expenseId: 1, links: [] });
    expect(links()).toEqual([]);
  });

  it('no guarda nada si se devuelve de más, si el ingreso no tiene tanto o si no es un gasto', () => {
    saveRefunds(db, {
      expenseId: 1,
      links: [{ reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 1000 }],
    });
    const before = links();

    expect(() =>
      saveRefunds(db, {
        expenseId: 6,
        links: [{ reimbursementTxId: 3, reimbursementSplitId: null, amountCents: 501 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      saveRefunds(db, {
        expenseId: 1,
        links: [{ reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 3001 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      saveRefunds(db, {
        expenseId: 2,
        links: [{ reimbursementTxId: 3, reimbursementSplitId: null, amountCents: 100 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      saveRefunds(db, {
        expenseId: 99,
        links: [{ reimbursementTxId: 3, reimbursementSplitId: null, amountCents: 100 }],
      }),
    ).toThrow(RangeError);
    expect(links()).toEqual(before);
  });

  it('no ofrece la entrada de un traspaso; de un ingreso dividido, lo no dividido y cada parte', () => {
    tx(7, '2026-09-10', -2000, 'A LA HUCHA');
    tx(8, '2026-09-10', 2000, 'A LA HUCHA', 2);
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (7, 8)');
    db.run(`INSERT INTO transaction_splits (id, transaction_id, description, amount_cents)
            VALUES (50, 5, 'EXTRA', 1000)`);
    const candidates = expenseRefundOptions(db, 1).candidates;
    expect(candidates.map((c) => c.id)).not.toContain(8);
    expect(candidates.filter((c) => c.id === 5)).toEqual([
      expect.objectContaining({ splitId: null, availableCents: 185000 - 1000 }),
      expect.objectContaining({ splitId: 50, description: 'NOMINA › EXTRA', availableCents: 1000 }),
    ]);
    expect(allTransactions(db).find((r) => r.id === 8)?.refundable).toBe(false);
    expect(allTransactions(db).find((r) => r.id === 2)?.refundable).toBe(false);
  });

  it('un Bizum de suministros dividido devuelve cada factura con su parte', () => {
    tx(10, '2026-09-20', 9000, 'BIZUM SUMINISTROS');
    db.run(`INSERT INTO transaction_splits (id, transaction_id, description, amount_cents)
            VALUES (101, 10, 'LUZ', 4000), (102, 10, 'AGUA', 2000)`);
    saveRefunds(db, {
      expenseId: 1,
      links: [{ reimbursementTxId: 10, reimbursementSplitId: 101, amountCents: 4000 }],
    });
    saveRefunds(db, {
      expenseId: 6,
      links: [{ reimbursementTxId: 10, reimbursementSplitId: 102, amountCents: 500 }],
    });

    expect(allTransactions(db).find((r) => r.id === 1)?.refunds).toEqual([
      expect.objectContaining({ description: 'BIZUM SUMINISTROS › LUZ', amountCents: 4000 }),
    ]);
    // Para la cena, la parte de la luz ya no está libre, y lo vinculado se ofrece con su importe.
    const options = expenseRefundOptions(db, 1).candidates.filter((c) => c.id === 10);
    expect(options).toEqual([
      expect.objectContaining({ splitId: null, availableCents: 3000, linkedCents: null }),
      expect.objectContaining({ splitId: 101, availableCents: 4000, linkedCents: 4000 }),
      expect.objectContaining({ splitId: 102, availableCents: 1500, linkedCents: null }),
    ]);
    // Una parte no devuelve más de lo que vale.
    expect(() =>
      saveRefunds(db, {
        expenseId: 1,
        links: [{ reimbursementTxId: 10, reimbursementSplitId: 102, amountCents: 1501 }],
      }),
    ).toThrow(RangeError);
  });

  describe('validación de parámetros', () => {
    it('acepta una lista bien formada', () => {
      const params = {
        expenseId: 1,
        links: [{ reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 300 }],
      };
      expect(expenseRefundsParam({ ...params, sobra: 1 })).toEqual(params);
    });

    it.each([
      ['no es un objeto', null],
      ['sin gasto', { expenseId: 0, links: [] }],
      ['sin lista', { expenseId: 1 }],
      ['una devolución que no es un objeto', { expenseId: 1, links: [2] }],
      [
        'un ingreso no válido',
        { expenseId: 1, links: [{ reimbursementTxId: 'x', amountCents: 1 }] },
      ],
      [
        'un importe con decimales',
        {
          expenseId: 1,
          links: [{ reimbursementTxId: 2, reimbursementSplitId: null, amountCents: 1.5 }],
        },
      ],
    ])('rechaza una lista con %s', (_name, params) => {
      expect(() => expenseRefundsParam(params)).toThrow(RangeError);
    });
  });
});
