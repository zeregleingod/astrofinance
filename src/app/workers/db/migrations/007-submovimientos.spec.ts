import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { MIGRATIONS } from './index';

describe('migración 007: submovimientos', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const tx = (amount: number, account = 1) => {
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_source,
         origin)
       VALUES (?, '2026-06-05', ?, 'Movimiento', 'ninguna', 'manual')`,
      [account, amount],
    );
    return Number(db.value('SELECT last_insert_rowid()'));
  };
  const split = (parent: number, amount: number, shared: number | null = null) => {
    db.run(
      `INSERT INTO transaction_splits (transaction_id, description, category_id, amount_cents,
         shared_person_id, shared_expected_cents)
       VALUES (?, 'PARTE', 2, ?, ?, ?)`,
      [parent, amount, shared === null ? null : 1, shared],
    );
    return Number(db.value('SELECT last_insert_rowid()'));
  };
  const toSplit = (bizum: number, splitId: number, cents: number) =>
    db.run(
      'INSERT INTO reimbursements (expense_split_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
      [splitId, bizum, cents],
    );

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    // Una BD anterior a la migración con un gasto compartido ya reembolsado.
    migrate(db, MIGRATIONS.slice(0, 6));
    db.run(`INSERT INTO categories (id, name) VALUES (1, 'Variables')`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES (2, 1, 'Hogar', 'gasto')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente'),
              (2, 'Hucha', 'ahorro')`);
    db.run(`INSERT INTO people (id, name) VALUES (1, 'Sergio')`);
    db.run(`INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
              category_source, origin)
            VALUES (10, 1, '2026-06-05', -11192, 'Cetelem', 'ninguna', 'manual'),
                   (11, 1, '2026-06-06', 5596, 'Bizum Sergio', 'ninguna', 'manual')`);
    db.run(`INSERT INTO shared_expenses (transaction_id, person_id, expected_cents)
            VALUES (10, 1, 5596)`);
    db.run(`INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents)
            VALUES (10, 11, 5596)`);
  });

  afterEach(() => raw.close());

  it('conserva los reembolsos y lo pendiente de cobrar', () => {
    expect(migrate(db, MIGRATIONS)).toMatchObject({ from: 6 });
    expect(
      db.rows(
        `SELECT expense_tx_id, category_id, expense_split_id, reimbursement_tx_id, amount_cents
         FROM reimbursements`,
      ),
    ).toEqual([
      {
        expense_tx_id: 10,
        category_id: null,
        expense_split_id: null,
        reimbursement_tx_id: 11,
        amount_cents: 5596,
      },
    ]);
    expect(db.rows('SELECT reimbursed_cents, pending_cents FROM shared_expense_status')).toEqual([
      { reimbursed_cents: 5596, pending_cents: 0 },
    ]);
    expect(db.rows('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.value('PRAGMA foreign_keys')).toBe(1);
  });

  it('divide un movimiento en partes de su signo sin pasar de su importe', () => {
    migrate(db, MIGRATIONS);
    const purchase = tx(-10000);
    split(purchase, -6000);
    split(purchase, -4000);
    expect(() => split(purchase, -1)).toThrow(/más de lo que hay/);
    expect(() => split(tx(-10000), 500)).toThrow(/signo/);
    expect(db.value('SELECT count(*) FROM transaction_splits')).toBe(2);
  });

  it('al cambiar una parte tampoco deja pasar del importe ni moverla a otro movimiento', () => {
    migrate(db, MIGRATIONS);
    const purchase = tx(-10000);
    const first = split(purchase, -6000);
    split(purchase, -3000);
    db.run('UPDATE transaction_splits SET amount_cents = -7000 WHERE id = ?', [first]);
    expect(() =>
      db.run('UPDATE transaction_splits SET amount_cents = -7001 WHERE id = ?', [first]),
    ).toThrow(/más de lo que hay/);
    expect(() =>
      db.run('UPDATE transaction_splits SET transaction_id = ? WHERE id = ?', [tx(-500), first]),
    ).toThrow(/otro movimiento/);
  });

  it('borrar el movimiento borra sus partes y lo devuelto a ellas', () => {
    migrate(db, MIGRATIONS);
    const purchase = tx(-10000);
    const shared = split(purchase, -6000, 3000);
    toSplit(tx(3000), shared, 3000);
    db.run('DELETE FROM transactions WHERE id = ?', [purchase]);
    expect(db.value('SELECT count(*) FROM transaction_splits')).toBe(0);
    expect(db.value('SELECT count(*) FROM reimbursements WHERE expense_split_id IS NOT NULL')).toBe(
      0,
    );
  });

  it('divide cualquier gasto: la salida de un traspaso y un gasto compartido entero', () => {
    migrate(db, MIGRATIONS);
    const outgoing = tx(-2000);
    const incoming = tx(2000, 2);
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (?, ?)', [
      outgoing,
      incoming,
    ]);
    split(outgoing, -1000);
    split(10, -5000);
    expect(db.value('SELECT count(*) FROM transaction_splits')).toBe(2);
  });

  it('divide cualquier movimiento: la entrada de un traspaso y un Bizum ya vinculado', () => {
    migrate(db, MIGRATIONS);
    const outgoing = tx(-2000);
    const incoming = tx(2000, 2);
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (?, ?)', [
      outgoing,
      incoming,
    ]);
    split(incoming, 1000);
    // El Bizum 11 devuelve 55,96 € del gasto 10: lo que le queda libre sí se divide.
    db.run(`UPDATE transactions SET amount_cents = 9000 WHERE id = 11`);
    split(11, 3404);
    expect(() => split(11, 1)).toThrow(/más de lo que hay/);
  });

  it('lo compartido se cobra una sola vez: entero o por submovimientos, no las dos cosas', () => {
    migrate(db, MIGRATIONS);
    // El gasto 10 ya está compartido entero.
    expect(() => split(10, -5000, 1000)).toThrow(/compartido entero/);
    const purchase = tx(-10000);
    split(purchase, -6000, 3000);
    expect(() =>
      db.run(
        'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (?, 1, 100)',
        [purchase],
      ),
    ).toThrow(/submovimientos compartidos/);
    // Sin submovimientos compartidos, sí se puede compartir entero.
    const other = tx(-8000);
    split(other, -2000);
    db.run(
      'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (?, 1, 4000)',
      [other],
    );
  });

  it('un ingreso dividido devuelve gastos con lo que no ha dividido, sin pasar de su importe', () => {
    migrate(db, MIGRATIONS);
    const income = tx(5000);
    split(income, 3000);
    const expense = tx(-5000);
    const toExpense = (cents: number) =>
      db.run(
        'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
        [expense, income, cents],
      );
    expect(() => toExpense(2001)).toThrow(/más de lo recibido/);
    toExpense(2000);
    // La entrada de un traspaso puede estar dividida.
    const purchase = tx(-4000);
    const incoming = tx(4000, 2);
    split(incoming, 1000);
    db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (?, ?)', [
      purchase,
      incoming,
    ]);
  });

  it('un submovimiento de un ingreso devuelve un gasto: el Bizum de suministros por partes', () => {
    migrate(db, MIGRATIONS);
    const light = tx(-4000);
    const water = tx(-2000);
    const bizum = tx(9000);
    const lightPart = split(bizum, 4000);
    const waterPart = split(bizum, 2000);
    const fromPart = (expense: number, part: number, cents: number) =>
      db.run(
        `INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, reimbursement_split_id,
           amount_cents)
         VALUES (?, ?, ?, ?)`,
        [expense, bizum, part, cents],
      );
    fromPart(light, lightPart, 4000);
    fromPart(water, waterPart, 2000);
    // Cada parte devuelve como mucho lo que vale.
    expect(() => fromPart(tx(-9000), lightPart, 1)).toThrow(/más de lo recibido/);
    // La parte es de ese ingreso, y de ingreso.
    expect(() => fromPart(tx(-100), split(tx(500), 100), 100)).toThrow(/de ese ingreso/);
    // Lo que el Bizum no ha dividido (3000) también puede devolver algo.
    db.run(
      'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, 3000)',
      [tx(-3000), bizum],
    );
    // Una parte no baja de lo que devuelve, y borrarla se lleva sus devoluciones.
    expect(() =>
      db.run('UPDATE transaction_splits SET amount_cents = 3999 WHERE id = ?', [lightPart]),
    ).toThrow(/menos de lo que devuelve/);
    db.run('DELETE FROM transaction_splits WHERE id = ?', [lightPart]);
    expect(
      db.value('SELECT count(*) FROM reimbursements WHERE reimbursement_split_id = ?', [lightPart]),
    ).toBe(0);
    // Y el Bizum entero ya no se puede dividir más de lo que le queda libre.
    expect(() => split(bizum, 4001)).toThrow(/más de lo que hay/);
  });

  it('comparte un submovimiento de gasto y le vincula Bizums sin devolver más de lo que cuesta', () => {
    migrate(db, MIGRATIONS);
    const purchase = tx(-10000);
    const home = split(purchase, -6000, 3000);
    const gift = split(purchase, -4000);
    toSplit(tx(1000), home, 1000);
    expect(
      db.rows('SELECT split_id, transaction_id, pending_cents FROM shared_split_status'),
    ).toEqual([{ split_id: home, transaction_id: purchase, pending_cents: 2000 }]);
    expect(() => toSplit(tx(5001), home, 5001)).toThrow(/más de lo gastado/);
    // Para vincular una devolución no hace falta compartir: solo que sea un gasto.
    toSplit(tx(100), gift, 100);
    expect(() => toSplit(tx(100), split(tx(5000), 1000), 100)).toThrow(/solo se devuelve un gasto/);
    // La parte esperada no puede superar la parte, ni compartirse un ingreso.
    expect(() => split(tx(-10000), -100, 200)).toThrow(/CHECK/);
    expect(() => split(tx(5000), 1000, 500)).toThrow(/CHECK/);
  });

  it('un submovimiento no baja de lo ya devuelto; dejar de compartirlo conserva sus devoluciones', () => {
    migrate(db, MIGRATIONS);
    const home = split(tx(-10000), -6000, 3000);
    toSplit(tx(2500), home, 2500);
    expect(() =>
      db.run(
        'UPDATE transaction_splits SET amount_cents = -2400, shared_expected_cents = 2400 WHERE id = ?',
        [home],
      ),
    ).toThrow(/menos de lo devuelto/);
    db.run(
      `UPDATE transaction_splits SET shared_person_id = NULL, shared_expected_cents = NULL
       WHERE id = ?`,
      [home],
    );
    expect(db.value('SELECT count(*) FROM reimbursements WHERE expense_split_id = ?', [home])).toBe(
      1,
    );
  });

  it('vincula devoluciones a cualquier gasto, sin compartirlo, y sobreviven a dejar de compartir', () => {
    migrate(db, MIGRATIONS);
    const dinner = tx(-12000);
    const toExpense = (bizum: number, cents: number) =>
      db.run(
        'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
        [dinner, bizum, cents],
      );
    // Tres amigos devuelven su parte de la cena.
    toExpense(tx(3000), 3000);
    toExpense(tx(3000), 3000);
    toExpense(tx(3000), 3000);
    expect(() => toExpense(tx(3001), 3001)).toThrow(/más de lo gastado/);
    expect(() =>
      db.run(
        'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, 100)',
        [tx(500), tx(100)],
      ),
    ).toThrow(/solo se devuelve un gasto/);

    // El gasto 10 estaba compartido con su Bizum: dejar de compartirlo no borra la devolución.
    db.run('DELETE FROM shared_expenses WHERE transaction_id = 10');
    expect(db.value('SELECT count(*) FROM reimbursements WHERE expense_tx_id = 10')).toBe(1);
    // Borrar el gasto sí se la lleva.
    db.run('DELETE FROM transactions WHERE id = ?', [dinner]);
    expect(db.value('SELECT count(*) FROM reimbursements WHERE expense_tx_id = ?', [dinner])).toBe(
      0,
    );
  });

  it('cada parte de un reembolso va a un solo destino', () => {
    migrate(db, MIGRATIONS);
    const home = split(tx(-10000), -6000, 3000);
    expect(() =>
      db.run(
        `INSERT INTO reimbursements (category_id, expense_split_id, reimbursement_tx_id, amount_cents)
         VALUES (2, ?, ?, 100)`,
        [home, tx(100)],
      ),
    ).toThrow(/CHECK/);
  });
});
