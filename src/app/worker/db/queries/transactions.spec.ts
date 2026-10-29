import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import type { TransactionEdit } from '@domain/transactions/transaction-edit';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { allTransactions } from './reports';
import { transactionEditParam, updateTransaction } from './transactions';

describe('edición de movimientos', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const category = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL', [name]));
  const group = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NULL', [name]));
  const stored = () =>
    db.rows(
      `SELECT description, original_description, booked_date, period, note, category_id,
              category_source, rule_id, amount_cents, op_date
       FROM transactions WHERE id = 1`,
    )[0];
  const edit = (extra: Partial<TransactionEdit> = {}): TransactionEdit => ({
    id: 1,
    description: 'Supermercado',
    bookedDate: '2026-09-10',
    categoryId: null,
    note: null,
    ...extra,
  });

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
    db.run(`INSERT INTO import_batches (id, account_id, bank_profile, file_name, file_sha256,
              date_from, date_to, rows_total, rows_new, rows_duplicate, rows_error)
            VALUES (1, 1, 'sabadell', 'sep.xls', '${'a'.repeat(64)}', '2026-09-01', '2026-09-30',
              1, 1, 0, 0)`);
    db.run(
      `INSERT INTO rules (id, name, priority, operator, pattern, category_id)
       VALUES (1, 'Súper', 1, 'contiene', 'MERCADO', ?)`,
      [category('Comida')],
    );
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
         original_description, category_id, category_source, rule_id, origin, import_batch_id,
         dedupe_hash)
       VALUES (1, 1, '2026-09-10', -4520, 'MERCADO DEMO 123', 'MERCADO DEMO 123', ?, 'regla', 1,
         'importado', 1, '${'b'.repeat(64)}')`,
      [category('Comida')],
    );
  });

  afterEach(() => raw.close());

  it('cambia el concepto visible y conserva el del banco, el importe y la fecha original', () => {
    updateTransaction(
      db,
      edit({ description: '  Supermercado  ', categoryId: category('Comida') }),
    );

    expect(stored()).toMatchObject({
      description: 'Supermercado',
      original_description: 'MERCADO DEMO 123',
      amount_cents: -4520,
      op_date: '2026-09-10',
    });
  });

  it('imputa el movimiento a otra fecha y a su mes; volver a la original lo deshace', () => {
    updateTransaction(db, edit({ bookedDate: '2026-08-31', categoryId: category('Comida') }));
    expect(stored()).toMatchObject({ booked_date: '2026-08-31', period: '2026-08' });
    expect(allTransactions(db)[0]).toMatchObject({ dateChanged: true, bookedDate: '2026-08-31' });

    updateTransaction(db, edit({ bookedDate: '2026-09-10', categoryId: category('Comida') }));
    expect(stored()).toMatchObject({ booked_date: null, period: '2026-09' });
    expect(allTransactions(db)[0]?.dateChanged).toBe(false);
  });

  it('si la categoría no cambia, conserva su origen (la regla que la puso)', () => {
    updateTransaction(db, edit({ categoryId: category('Comida'), note: ' Ticket guardado ' }));

    expect(stored()).toMatchObject({
      note: 'Ticket guardado',
      category_id: category('Comida'),
      category_source: 'regla',
      rule_id: 1,
    });
  });

  it('elegir otra categoría la marca como manual: las reglas ya no la tocan', () => {
    updateTransaction(db, edit({ categoryId: category('Hogar') }));

    expect(stored()).toMatchObject({
      category_id: category('Hogar'),
      category_source: 'manual',
      rule_id: null,
    });
    expect(allTransactions(db)[0]).toMatchObject({
      categoryId: category('Hogar'),
      categoryName: 'Variables',
      subcategoryName: 'Hogar',
      originalDescription: 'MERCADO DEMO 123',
    });
  });

  it('se puede dejar sin categoría', () => {
    updateTransaction(db, edit());

    expect(stored()).toMatchObject({
      category_id: null,
      category_source: 'ninguna',
      rule_id: null,
    });
  });

  it('no admite categorías principales ni movimientos o datos que no existen, y no cambia nada', () => {
    const before = stored();

    expect(() => updateTransaction(db, edit({ categoryId: group('Variables') }))).toThrow(
      RangeError,
    );
    expect(() => updateTransaction(db, edit({ categoryId: 999_999 }))).toThrow(RangeError);
    expect(() => updateTransaction(db, edit({ id: 999 }))).toThrow(RangeError);
    expect(() => updateTransaction(db, edit({ description: ' ' }))).toThrow(RangeError);
    expect(() => updateTransaction(db, edit({ bookedDate: '2026-02-30' }))).toThrow(RangeError);
    expect(stored()).toEqual(before);
  });

  it('los textos se guardan como dato, no como SQL', () => {
    const evil = `'); DROP TABLE transactions; --`;
    updateTransaction(db, edit({ description: evil, note: evil }));

    expect(stored()).toMatchObject({ description: evil, note: evil });
  });

  describe('validación de parámetros', () => {
    it('acepta un cambio bien formado', () => {
      expect(transactionEditParam({ ...edit({ categoryId: 3, note: 'x' }), sobra: 1 })).toEqual(
        edit({ categoryId: 3, note: 'x' }),
      );
      expect(transactionEditParam({ id: 1, description: 'A', bookedDate: '2026-01-01' })).toEqual({
        id: 1,
        description: 'A',
        bookedDate: '2026-01-01',
        categoryId: null,
        note: null,
      });
    });

    it.each([
      ['no es un objeto', null],
      ['sin id', { ...edit(), id: 0 }],
      ['id no numérico', { ...edit(), id: '1' }],
      ['concepto no textual', { ...edit(), description: 7 }],
      ['fecha imposible', { ...edit(), bookedDate: '2026-13-01' }],
      ['categoría no numérica', { ...edit(), categoryId: '3' }],
      ['observación no textual', { ...edit(), note: 5 }],
    ])('rechaza un cambio con %s', (_name, params) => {
      expect(() => transactionEditParam(params)).toThrow(RangeError);
    });
  });
});
