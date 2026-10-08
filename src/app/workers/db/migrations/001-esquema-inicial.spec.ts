import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { categoryTemplateStatements } from '../seeds/category-template';
import { MIGRATIONS } from './index';
import { migration001 } from './001-esquema-inicial';

type Bind = (string | number | null)[];

describe('Migración 001: esquema inicial', () => {
  let sqlite3: Sqlite3Static;
  let db: Database;

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    db = new sqlite3.oo1.DB(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.transaction(() => {
      db.exec(migration001.sql);
      db.exec(`PRAGMA user_version = ${migration001.version}`);
    });
  });

  afterEach(() => db.close());

  // sqlite-wasm rechaza un `bind` vacío en sentencias sin parámetros.
  const params = (bind: Bind) => (bind.length > 0 ? bind : undefined);
  const run = (sql: string, bind: Bind = []) => db.exec({ sql, bind: params(bind) });
  const value = (sql: string, bind: Bind = []) => db.selectValue(sql, params(bind));

  function account(name = 'Sabadell'): number {
    run(`INSERT INTO accounts (name, kind) VALUES (?, 'corriente')`, [name]);
    return Number(value('SELECT last_insert_rowid()'));
  }

  function category(name = 'Hogar', kind = 'gasto', parentId: number | null = null): number {
    run('INSERT INTO categories (parent_id, name, kind) VALUES (?, ?, ?)', [parentId, name, kind]);
    return Number(value('SELECT last_insert_rowid()'));
  }

  function tx(accountId: number, amountCents: number, opDate = '2026-03-10'): number {
    run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, origin)
       VALUES (?, ?, ?, 'Movimiento', 'manual')`,
      [accountId, opDate, amountCents],
    );
    return Number(value('SELECT last_insert_rowid()'));
  }

  function person(name = 'Sergio'): number {
    run('INSERT INTO people (name) VALUES (?)', [name]);
    return Number(value('SELECT last_insert_rowid()'));
  }

  describe('estructura', () => {
    it('es la primera migración registrada', () => {
      expect(MIGRATIONS.map((m) => m.version)).toEqual([1]);
      expect(value('PRAGMA user_version')).toBe(1);
    });

    it('crea todas las tablas en modo STRICT', () => {
      const tables = db.selectObjects(
        `SELECT name, strict FROM pragma_table_list
         WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      );
      expect(tables.map((t) => t['name'])).toEqual([
        'accounts',
        'budgets',
        'categories',
        'import_batches',
        'loan_installments',
        'loans',
        'meta',
        'people',
        'recurring_occurrences',
        'recurring_series',
        'reimbursements',
        'rules',
        'settings',
        'shared_expenses',
        'transactions',
        'transfers',
      ]);
      expect(tables.every((t) => t['strict'] === 1)).toBe(true);
    });

    it('deja la BD íntegra y sin claves foráneas rotas', () => {
      expect(value('PRAGMA integrity_check')).toBe('ok');
      expect(db.selectArrays('PRAGMA foreign_key_check')).toEqual([]);
    });

    it('crea la fila única de meta con un UUID v4 y la revisión a 0', () => {
      const meta = db.selectObject('SELECT id, db_uuid, revision FROM meta');
      expect(meta?.['id']).toBe(1);
      expect(meta?.['revision']).toBe(0);
      expect(String(meta?.['db_uuid'])).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(() => run(`INSERT INTO meta (id, db_uuid, created_at) VALUES (2, 'x', 'y')`)).toThrow(
        /CHECK constraint failed/,
      );
    });
  });

  describe('cuentas', () => {
    it('solo guarda los 4 últimos dígitos del IBAN', () => {
      run(`INSERT INTO accounts (name, kind, iban_last4) VALUES ('A', 'corriente', '6019')`);
      expect(() =>
        run(
          `INSERT INTO accounts (name, kind, iban_last4) VALUES ('B', 'corriente', 'ES1200810000000000006019')`,
        ),
      ).toThrow(/CHECK constraint failed/);
    });

    it('admite cuentas de ahorro y rechaza nombres repetidos sin distinguir mayúsculas', () => {
      run(`INSERT INTO accounts (name, kind) VALUES ('Caixa Futur', 'ahorro')`);
      expect(() =>
        run(`INSERT INTO accounts (name, kind) VALUES ('caixa futur', 'ahorro')`),
      ).toThrow(/UNIQUE constraint failed/);
      expect(() => run(`INSERT INTO accounts (name, kind) VALUES ('X', 'credito')`)).toThrow(
        /CHECK constraint failed/,
      );
    });
  });

  describe('categorías', () => {
    it('rechaza nombres repetidos entre hermanas, también en la raíz', () => {
      const root = category('Variables');
      category('Hogar', 'gasto', root);
      expect(() => category('hogar', 'gasto', root)).toThrow(/UNIQUE constraint failed/);
      expect(() => category('Variables')).toThrow(/UNIQUE constraint failed/);
    });

    it('rechaza tipos desconocidos y que una categoría sea su propio padre', () => {
      expect(() => category('X', 'otro')).toThrow(/CHECK constraint failed/);
      const id = category('Y');
      expect(() => run('UPDATE categories SET parent_id = id WHERE id = ?', [id])).toThrow(
        /CHECK constraint failed/,
      );
    });

    it('no deja borrar una categoría con movimientos', () => {
      const cat = category();
      const id = tx(account(), -1855);
      run(`UPDATE transactions SET category_id = ?, category_source = 'manual' WHERE id = ?`, [
        cat,
        id,
      ]);
      expect(() => run('DELETE FROM categories WHERE id = ?', [cat])).toThrow(
        /FOREIGN KEY constraint failed/,
      );
    });
  });

  describe('movimientos', () => {
    it('rechaza importes no enteros (céntimos) y a cero', () => {
      const acc = account();
      expect(() => tx(acc, 12.5)).toThrow(/cannot store REAL value in INTEGER column/);
      expect(() => tx(acc, 0)).toThrow(/CHECK constraint failed/);
    });

    it('rechaza fechas inexistentes o fuera del formato ISO', () => {
      const acc = account();
      expect(() => tx(acc, -100, '2026-02-30')).toThrow(/CHECK constraint failed/);
      expect(() => tx(acc, -100, '10/03/2026')).toThrow(/CHECK constraint failed/);
      expect(() => tx(acc, -100, '2026-03-10T00:00')).toThrow(/CHECK constraint failed/);
    });

    it('rechaza una cuenta inexistente', () => {
      expect(() => tx(999, -100)).toThrow(/FOREIGN KEY constraint failed/);
    });

    it('imputa al mes de la fecha original salvo que se fije una fecha imputada', () => {
      const acc = account();
      const id = tx(acc, 1278, '2026-03-12');
      expect(value('SELECT period FROM transactions WHERE id = ?', [id])).toBe('2026-03');

      run(`UPDATE transactions SET booked_date = '2026-02-27' WHERE id = ?`, [id]);
      expect(value('SELECT period FROM transactions WHERE id = ?', [id])).toBe('2026-02');
      expect(value('SELECT op_date FROM transactions WHERE id = ?', [id])).toBe('2026-03-12');

      for (const invalid of ['2026-02', '2026-02-30', '27/02/2026']) {
        expect(() =>
          run('UPDATE transactions SET booked_date = ? WHERE id = ?', [invalid, id]),
        ).toThrow(/CHECK constraint failed/);
      }
    });

    it('exige coherencia entre categoría y su origen', () => {
      const id = tx(account(), -100);
      const cat = category();
      expect(() =>
        run(`UPDATE transactions SET category_id = ?, category_source = 'ninguna' WHERE id = ?`, [
          cat,
          id,
        ]),
      ).toThrow(/CHECK constraint failed/);
      expect(() =>
        run(`UPDATE transactions SET category_source = 'manual' WHERE id = ?`, [id]),
      ).toThrow(/CHECK constraint failed/);
    });

    it('exige lote y hash a los importados, y el hash no se repite', () => {
      const acc = account();
      run(
        `INSERT INTO import_batches (account_id, bank_profile, file_name, file_sha256,
           date_from, date_to, rows_total, rows_new, rows_duplicate, rows_error)
         VALUES (?, 'sabadell', 'mayo.xls', ?, '2025-05-01', '2025-05-31', 2, 1, 1, 0)`,
        [acc, 'a'.repeat(64)],
      );
      const batch = Number(value('SELECT last_insert_rowid()'));
      const insert = (hash: string | null) =>
        run(
          `INSERT INTO transactions (account_id, op_date, amount_cents, description, origin,
             import_batch_id, dedupe_hash)
           VALUES (?, '2025-05-02', -100, 'COMPRA TARJ.', 'importado', ?, ?)`,
          [acc, batch, hash],
        );

      expect(() => insert(null)).toThrow(/CHECK constraint failed/);
      insert('h'.repeat(64));
      expect(() => insert('h'.repeat(64))).toThrow(/UNIQUE constraint failed/);
    });

    it('trata el texto como dato y no como SQL', () => {
      const acc = account();
      const evil = "x'); DROP TABLE transactions; --";
      run(
        `INSERT INTO transactions (account_id, op_date, amount_cents, description, origin)
         VALUES (?, '2026-03-01', -1, ?, 'manual')`,
        [acc, evil],
      );
      expect(value('SELECT description FROM transactions')).toBe(evil);
    });
  });

  describe('traspasos entre cuentas propias', () => {
    it('exigen salida negativa, entrada positiva por el mismo importe y cuentas distintas', () => {
      const main = account('Sabadell');
      const savings = account('N26');
      const out = tx(main, -10000);
      const inOk = tx(savings, 10000);
      const inWrong = tx(savings, 9000);
      const sameAccount = tx(main, 10000);

      const link = (o: number, i: number) =>
        run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (?, ?)', [o, i]);

      expect(() => link(out, inWrong)).toThrow(/traspaso/);
      expect(() => link(out, sameAccount)).toThrow(/traspaso/);
      link(out, inOk);
      expect(() => link(out, inOk)).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('gastos compartidos y reembolsos', () => {
    function sharedExpense(acc: number, amount: number, expected: number, who: number): number {
      const id = tx(acc, amount);
      run(
        'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (?, ?, ?)',
        [id, who, expected],
      );
      return id;
    }

    const allocate = (expense: number, reimbursement: number, cents: number) =>
      run(
        'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
        [expense, reimbursement, cents],
      );

    it('solo comparte gastos y por no más de su importe', () => {
      const acc = account();
      const who = person();
      expect(() => sharedExpense(acc, 4999, 2500, who)).toThrow(/gasto compartido/);
      expect(() => sharedExpense(acc, -4999, 5000, who)).toThrow(/gasto compartido/);
    });

    it('un Bizum puede cubrir varios gastos y calcula lo pendiente', () => {
      const acc = account();
      const who = person();
      // Hipoteca de marzo: 131,41 € + 6,77 € compartidos; Sergio devuelve 69,09 €.
      const loan = sharedExpense(acc, -13141, 6571, who);
      const insurance = sharedExpense(acc, -677, 338, who);
      const bizum = tx(acc, 6909);
      allocate(loan, bizum, 6571);
      allocate(insurance, bizum, 338);

      const rows = db.selectObjects(
        'SELECT transaction_id, reimbursed_cents, pending_cents FROM shared_expense_status ORDER BY transaction_id',
      );
      expect(rows).toEqual([
        { transaction_id: loan, reimbursed_cents: 6571, pending_cents: 0 },
        { transaction_id: insurance, reimbursed_cents: 338, pending_cents: 0 },
      ]);
    });

    it('rechaza reembolsos negativos o que asignan más de lo recibido o de lo gastado', () => {
      const acc = account();
      const who = person();
      const expense = sharedExpense(acc, -3929, 3929, who);
      const other = sharedExpense(acc, -1250, 1250, who);
      const negative = tx(acc, -100);
      const bizum = tx(acc, 3929);
      const big = tx(acc, 9999);

      expect(() => allocate(expense, negative, 100)).toThrow(/reembolso/);
      allocate(expense, bizum, 3000);
      expect(() => allocate(other, bizum, 1000)).toThrow(/reembolso/);
      expect(() => allocate(expense, big, 1000)).toThrow(/reembolso/);
      expect(() =>
        run('UPDATE reimbursements SET amount_cents = 4000 WHERE expense_tx_id = ?', [expense]),
      ).toThrow(/reembolso/);
      run('UPDATE reimbursements SET amount_cents = 3929 WHERE expense_tx_id = ?', [expense]);
    });

    it('al borrar el Bizum el gasto vuelve a quedar pendiente', () => {
      const acc = account();
      const expense = sharedExpense(acc, -1250, 1250, person());
      const bizum = tx(acc, 1250);
      allocate(expense, bizum, 1250);
      run('DELETE FROM transactions WHERE id = ?', [bizum]);
      expect(
        value('SELECT pending_cents FROM shared_expense_status WHERE transaction_id = ?', [
          expense,
        ]),
      ).toBe(1250);
    });
  });

  describe('préstamos y financiaciones', () => {
    function loan(): number {
      run(
        `INSERT INTO loans (name, kind, lender, installment_cents, installments_total, first_due_date)
         VALUES ('Colchón', 'financiacion', 'Cetelem', 11192, 24, '2024-10-05')`,
      );
      return Number(value('SELECT last_insert_rowid()'));
    }

    it('numera las cuotas sin repetir y cada pago cubre una sola cuota', () => {
      const id = loan();
      const payment = tx(account(), -11192, '2026-03-05');
      const installment = (n: number, txId: number | null) =>
        run(
          `INSERT INTO loan_installments (loan_id, number, due_date, amount_cents, transaction_id)
           VALUES (?, ?, '2026-03-05', 11192, ?)`,
          [id, n, txId],
        );

      installment(18, payment);
      expect(() => installment(18, null)).toThrow(/UNIQUE constraint failed/);
      expect(() => installment(19, payment)).toThrow(/UNIQUE constraint failed/);
      expect(() => installment(0, null)).toThrow(/CHECK constraint failed/);
    });

    it('la parte compartida exige persona y no supera la cuota', () => {
      const who = person();
      const insert = (personId: number | null, cents: number | null) =>
        run(
          `INSERT INTO loans (name, kind, installment_cents, installments_total, first_due_date,
             shared_person_id, shared_cents)
           VALUES ('Ikea', 'financiacion', 5049, 10, '2025-08-02', ?, ?)`,
          [personId, cents],
        );
      expect(() => insert(null, 2525)).toThrow(/CHECK constraint failed/);
      expect(() => insert(who, 6000)).toThrow(/CHECK constraint failed/);
      insert(who, 2525);
    });
  });

  describe('presupuestos y previstos', () => {
    it('un presupuesto por categoría y mes', () => {
      const cat = category();
      run(`INSERT INTO budgets (category_id, period, amount_cents) VALUES (?, '2026-03', 15000)`, [
        cat,
      ]);
      expect(() =>
        run(`INSERT INTO budgets (category_id, period, amount_cents) VALUES (?, '2026-03', 1)`, [
          cat,
        ]),
      ).toThrow(/UNIQUE constraint failed/);
      expect(() =>
        run(`INSERT INTO budgets (category_id, period, amount_cents) VALUES (?, '2026-3', 1)`, [
          cat,
        ]),
      ).toThrow(/CHECK constraint failed/);
    });

    it('un cargo previsto de importe desconocido se marca cumplido con su movimiento', () => {
      run(
        `INSERT INTO recurring_series (name, source, status, frequency, anchor_date)
         VALUES ('IBI', 'manual', 'confirmada', 'anual', '2026-06-01')`,
      );
      const series = Number(value('SELECT last_insert_rowid()'));
      const payment = tx(account(), -32050, '2026-06-03');
      const occurrence = (status: string, txId: number | null, date = '2026-06-01') =>
        run(
          `INSERT INTO recurring_occurrences (series_id, due_date, status, transaction_id)
           VALUES (?, ?, ?, ?)`,
          [series, date, status, txId],
        );

      expect(() => occurrence('cumplida', null)).toThrow(/CHECK constraint failed/);
      occurrence('cumplida', payment);
      expect(() => occurrence('omitida', null)).toThrow(/UNIQUE constraint failed/);

      run('DELETE FROM transactions WHERE id = ?', [payment]);
      expect(value('SELECT count(*) FROM recurring_occurrences')).toBe(0);
    });

    it('las sugerencias solo vienen del detector', () => {
      expect(() =>
        run(
          `INSERT INTO recurring_series (name, source, status, frequency, anchor_date)
           VALUES ('X', 'manual', 'sugerida', 'mensual', '2026-01-01')`,
        ),
      ).toThrow(/CHECK constraint failed/);
    });
  });

  describe('plantilla de categorías', () => {
    beforeEach(() => {
      for (const statement of categoryTemplateStatements()) {
        run(statement.sql, [...statement.bind]);
      }
    });

    it('carga los seis grupos del Excel con sus subcategorías', () => {
      expect(
        db.selectValues('SELECT name FROM categories WHERE parent_id IS NULL ORDER BY sort_order'),
      ).toEqual([
        'Ingresos',
        'Ahorro',
        'Hipoteca y vivienda',
        'Préstamos y financiaciones',
        'Suministros',
        'Variables',
      ]);
      expect(Number(value('SELECT count(*) FROM categories WHERE parent_id IS NOT NULL'))).toBe(24);
    });

    it('las subcategorías tienen el mismo tipo que su grupo', () => {
      expect(
        value(
          `SELECT count(*) FROM categories c JOIN categories p ON p.id = c.parent_id
           WHERE c.kind <> p.kind`,
        ),
      ).toBe(0);
    });
  });
});
