import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { SplitLine } from '@domain/transactions/transaction-split';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { allTransactions } from './reports';
import { saveSplits, transactionSplitsParam } from './splits';

describe('submovimientos: guardar', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const category = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL', [name]));
  const group = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL', [name]));
  const line = (amountCents: number, extra: Partial<SplitLine> = {}): SplitLine => ({
    id: null,
    description: 'Parte',
    categoryId: category('Hogar'),
    amountCents,
    ...extra,
  });
  const stored = () =>
    db.rows(
      `SELECT id, description, category_id, amount_cents FROM transaction_splits
       WHERE transaction_id = 1 ORDER BY id`,
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
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(`INSERT INTO people (id, name) VALUES (1, 'Sergio')`);
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, category_id,
         category_source, origin)
       VALUES (1, 1, '2026-09-10', -10000, 'BAZAR DEMO', ?, 'manual', 'manual'),
              (2, 1, '2026-09-12', 3000, 'BIZUM SERGIO', NULL, 'ninguna', 'manual')`,
      [category('Comida')],
    );
  });

  afterEach(() => raw.close());

  it('divide un movimiento en varias partes con el concepto en mayúsculas', () => {
    saveSplits(db, {
      transactionId: 1,
      splits: [
        line(-6000, { description: ' cojines ' }),
        line(-2500, { description: 'Regalo', categoryId: category('Regalos') }),
        line(-500, { description: 'Pilas', categoryId: null }),
      ],
    });

    expect(stored().map(({ description, amount_cents }) => [description, amount_cents])).toEqual([
      ['COJINES', -6000],
      ['REGALO', -2500],
      ['PILAS', -500],
    ]);
    const [row] = allTransactions(db).filter((r) => r.id === 1);
    expect(row?.splits).toEqual([
      expect.objectContaining({
        description: 'COJINES',
        amountCents: -6000,
        categoryName: 'Variables',
        subcategoryName: 'Hogar',
        shared: false,
      }),
      expect.objectContaining({ description: 'REGALO', subcategoryName: 'Regalos' }),
      expect.objectContaining({ description: 'PILAS', categoryId: null, categoryName: null }),
    ]);
  });

  it('al volver a guardar conserva los que siguen, añade los nuevos y borra los que faltan', () => {
    saveSplits(db, { transactionId: 1, splits: [line(-6000), line(-3000)] });
    const [first] = stored();
    // Lo compartido de una parte se conserva mientras siga existiendo.
    db.run(
      `UPDATE transaction_splits SET shared_person_id = 1, shared_expected_cents = 3000
       WHERE id = ?`,
      [Number(first?.['id'])],
    );

    saveSplits(db, {
      transactionId: 1,
      splits: [
        line(-4000, { id: Number(first?.['id']), description: 'Cojines' }),
        line(-5000, { description: 'Lámpara' }),
      ],
    });

    expect(stored()).toEqual([
      expect.objectContaining({ id: first?.['id'], description: 'COJINES', amount_cents: -4000 }),
      expect.objectContaining({ description: 'LÁMPARA', amount_cents: -5000 }),
    ]);
    expect(
      db.value('SELECT shared_expected_cents FROM transaction_splits WHERE id = ?', [
        Number(first?.['id']),
      ]),
    ).toBe(3000);
  });

  it('si una parte compartida baja de lo que se esperaba, lo esperado baja con ella', () => {
    saveSplits(db, { transactionId: 1, splits: [line(-6000)] });
    const id = Number(stored()[0]?.['id']);
    db.run(
      `UPDATE transaction_splits SET shared_person_id = 1, shared_expected_cents = 5000
       WHERE id = ?`,
      [id],
    );
    saveSplits(db, { transactionId: 1, splits: [line(-2000, { id })] });
    expect(
      db.value('SELECT shared_expected_cents FROM transaction_splits WHERE id = ?', [id]),
    ).toBe(2000);
    expect(allTransactions(db).find((r) => r.id === 1)?.splits[0]?.shared).toBe(true);
  });

  it('pasar más importe de un lado a otro no tropieza con el límite del total', () => {
    saveSplits(db, { transactionId: 1, splits: [line(-9000), line(-1000)] });
    const [a, b] = stored().map((s) => Number(s['id']));
    saveSplits(db, {
      transactionId: 1,
      splits: [line(-1000, { id: a }), line(-9000, { id: b })],
    });
    expect(stored().map((s) => s['amount_cents'])).toEqual([-1000, -9000]);
  });

  it('una lista vacía deja el movimiento sin dividir', () => {
    saveSplits(db, { transactionId: 1, splits: [line(-6000)] });
    saveSplits(db, { transactionId: 1, splits: [] });
    expect(stored()).toEqual([]);
    expect(allTransactions(db).find((r) => r.id === 1)?.splits).toEqual([]);
  });

  it('no guarda nada si no cuadra, si la categoría no vale o si el movimiento no existe', () => {
    saveSplits(db, { transactionId: 1, splits: [line(-6000)] });
    const before = stored();

    expect(() => saveSplits(db, { transactionId: 1, splits: [line(-6000), line(-4001)] })).toThrow(
      RangeError,
    );
    expect(() =>
      saveSplits(db, { transactionId: 1, splits: [line(-100, { description: ' ' })] }),
    ).toThrow(RangeError);
    expect(() => saveSplits(db, { transactionId: 1, splits: [line(100)] })).toThrow(RangeError);
    expect(() =>
      saveSplits(db, {
        transactionId: 1,
        splits: [line(-100, { categoryId: group('Variables') })],
      }),
    ).toThrow(RangeError);
    expect(() => saveSplits(db, { transactionId: 999, splits: [line(-100)] })).toThrow(RangeError);
    expect(() => saveSplits(db, { transactionId: 1, splits: [line(-100, { id: 999 })] })).toThrow(
      RangeError,
    );
    expect(stored()).toEqual(before);
  });

  it('un ingreso que ya devuelve un gasto se divide en lo que le queda libre', () => {
    db.run(
      'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (1, 2, 1000)',
    );
    expect(allTransactions(db).find((r) => r.id === 2)?.refundingCents).toBe(1000);
    expect(() =>
      saveSplits(db, { transactionId: 2, splits: [line(2001, { categoryId: null })] }),
    ).toThrow(RangeError);
    saveSplits(db, { transactionId: 2, splits: [line(2000, { categoryId: null })] });
    expect(db.value('SELECT count(*) FROM transaction_splits WHERE transaction_id = 2')).toBe(1);
  });

  it('se divide cualquier movimiento: un gasto compartido y las dos patas de un traspaso', () => {
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (2, 'Hucha', 'ahorro')`);
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
         category_source, origin)
       VALUES (3, 1, '2026-09-15', -2000, 'A LA HUCHA', 'ninguna', 'manual'),
              (4, 2, '2026-09-15', 2000, 'A LA HUCHA', 'ninguna', 'manual')`,
    );
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (3, 4)');
    db.run(
      'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (1, 1, 5000)',
    );

    saveSplits(db, { transactionId: 1, splits: [line(-6000)] });
    saveSplits(db, { transactionId: 3, splits: [line(-500, { categoryId: null })] });
    saveSplits(db, { transactionId: 4, splits: [line(500, { categoryId: null })] });
    expect(db.value('SELECT count(*) FROM transaction_splits')).toBe(3);
  });

  it('los textos se guardan como dato, no como SQL', () => {
    const evil = `'); DROP TABLE transaction_splits; --`;
    saveSplits(db, { transactionId: 1, splits: [line(-100, { description: evil })] });
    expect(stored()[0]?.['description']).toBe(evil.toLocaleUpperCase('es'));
  });

  describe('validación de parámetros', () => {
    it('acepta una lista bien formada', () => {
      const params = { transactionId: 1, splits: [line(-100, { id: 4 }), line(-200)] };
      expect(transactionSplitsParam({ ...params, sobra: 1 })).toEqual(params);
    });

    // Se arma al recoger los tests, sin BD: la categoría va a mano.
    const part = { id: null, description: 'Parte', categoryId: 3, amountCents: -1 };

    it.each([
      ['no es un objeto', null],
      ['sin movimiento', { transactionId: 0, splits: [] }],
      ['sin lista', { transactionId: 1 }],
      ['una parte que no es un objeto', { transactionId: 1, splits: [3] }],
      ['un id no válido', { transactionId: 1, splits: [{ ...part, id: -2 }] }],
      ['un concepto no textual', { transactionId: 1, splits: [{ ...part, description: 1 }] }],
      ['una categoría no numérica', { transactionId: 1, splits: [{ ...part, categoryId: '3' }] }],
      ['un importe con decimales', { transactionId: 1, splits: [{ ...part, amountCents: 1.5 }] }],
    ])('rechaza una lista con %s', (_name, params) => {
      expect(() => transactionSplitsParam(params)).toThrow(RangeError);
    });
  });
});
