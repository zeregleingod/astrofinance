import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { categoryTemplateStatements } from '../seeds/category-template';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { monthReport, summaryTransactionIds, yearReport } from './reports';

/**
 * Submovimientos en los informes (ADR-0019): cada parte cuenta en su subcategoría y en el mes
 * del movimiento, y en el movimiento solo queda lo que no se ha dividido.
 */
describe('informes con submovimientos', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const category = (name: string) =>
    Number(db.value('SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL', [name]));
  const tx = (id: number, date: string, cents: number, description: string, cat: string | null) =>
    db.run(
      `INSERT INTO transactions (id, account_id, op_date, amount_cents, description, category_id,
         category_source, origin)
       VALUES (?, 1, ?, ?, ?, ?, ?, 'manual')`,
      [
        id,
        date,
        cents,
        description,
        cat === null ? null : category(cat),
        cat ? 'manual' : 'ninguna',
      ],
    );
  const split = (id: number, parent: number, cents: number, description: string, cat: string) =>
    db.run(
      `INSERT INTO transaction_splits (id, transaction_id, description, category_id, amount_cents)
       VALUES (?, ?, ?, ?, ?)`,
      [id, parent, description, category(cat), cents],
    );
  const line = (period: string, name: string) =>
    monthReport(db, period)
      .groups.flatMap((g) => g.lines)
      .find((l) => l.name === name);

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
    // Una compra de 100 € en el bazar: 60 € para el piso (a medias), 25 € de regalo y el resto,
    // sin dividir, se queda en Comida.
    tx(1, '2026-09-10', -10000, 'BAZAR DEMO', 'Comida');
    split(11, 1, -6000, 'COJINES', 'Hogar');
    split(12, 1, -2500, 'REGALO', 'Regalos');
    db.run(
      `UPDATE transaction_splits SET shared_person_id = 1, shared_expected_cents = 3000
       WHERE id = 11`,
    );
    // Sergio devuelve 20 € de su parte en octubre.
    tx(2, '2026-10-02', 2000, 'BIZUM SERGIO', null);
    db.run(
      `INSERT INTO reimbursements (expense_split_id, reimbursement_tx_id, amount_cents)
       VALUES (11, 2, 2000)`,
    );
  });

  afterEach(() => raw.close());

  it('cada parte cuenta en su subcategoría y en el movimiento queda el resto', () => {
    expect(line('2026-09', 'Hogar')).toMatchObject({
      totalCents: -6000 + 2000,
      reimbursedCents: 2000,
      count: 2,
    });
    expect(line('2026-09', 'Regalos')).toMatchObject({ totalCents: -2500, count: 1 });
    expect(line('2026-09', 'Comida')).toMatchObject({ totalCents: -1500, count: 1 });
  });

  it('dividir no cambia el balance: el Bizum cuenta en el mes del gasto', () => {
    const september = monthReport(db, '2026-09');
    expect(september.balanceCents).toBe(-10000 + 2000);
    expect(september.expenseCents).toBe(-10000 + 2000);
    expect(september.reimbursedCents).toBe(2000);
    expect(monthReport(db, '2026-10').balanceCents).toBe(0);
  });

  it('lo que falta por devolver del submovimiento suma en lo pendiente del mes', () => {
    expect(monthReport(db, '2026-09').pendingReimbursementCents).toBe(1000);
    expect(summaryTransactionIds(db, '2026-09', 'pendiente')).toEqual([1]);
  });

  it('enseña cada parte con su concepto y el Bizum justo debajo de la suya', () => {
    expect(
      line('2026-09', 'Hogar')?.movements.map((m) => [m.key, m.description, m.amountCents]),
    ).toEqual([
      ['s11', 'COJINES', -6000],
      ['r1', 'BIZUM SERGIO', 2000],
    ]);
    expect(line('2026-09', 'Comida')?.movements.map((m) => [m.description, m.amountCents])).toEqual(
      [['BAZAR DEMO', -1500]],
    );
  });

  it('dividido entero, el movimiento desaparece de su línea', () => {
    split(13, 1, -1500, 'PAN', 'Restaurantes');
    expect(line('2026-09', 'Comida')).toMatchObject({ totalCents: 0, count: 0, movements: [] });
    expect(line('2026-09', 'Restaurantes')).toMatchObject({ totalCents: -1500, count: 1 });
  });

  it('el total de gastos lleva al movimiento y al Bizum de su submovimiento', () => {
    expect(summaryTransactionIds(db, '2026-09', 'gastos')).toEqual([1, 2]);
    expect(summaryTransactionIds(db, '2026-09', 'balance')).toEqual([1, 2]);
    expect(summaryTransactionIds(db, '2026-10', 'balance')).toEqual([]);
  });

  it('la hoja anual reparte igual', () => {
    const year = yearReport(db, 2026);
    const row = (name: string) =>
      year.groups.flatMap((g) => g.lines).find((l) => l.name === name)?.months[8];
    expect(row('Hogar')).toBe(-4000);
    expect(row('Regalos')).toBe(-2500);
    expect(row('Comida')).toBe(-1500);
  });

  describe('un gasto compartido entero que luego se divide', () => {
    beforeEach(() => {
      // La compra del súper, a medias con Sergio, separada en comida, hogar y lo que queda.
      tx(3, '2026-08-05', -10000, 'SUPER DEMO', 'Comida');
      db.run(
        'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (3, 1, 5000)',
      );
      split(31, 3, -6000, 'LIMPIEZA', 'Hogar');
      split(32, 3, -2500, 'FLORES', 'Regalos');
      tx(4, '2026-08-07', 5000, 'BIZUM SERGIO SUPER', null);
      db.run(
        `INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents)
         VALUES (3, 4, 5000)`,
      );
    });

    it('el Bizum se reparte en proporción entre los submovimientos y el resto', () => {
      expect(line('2026-08', 'Hogar')).toMatchObject({
        totalCents: -6000 + 3000,
        reimbursedCents: 3000,
      });
      expect(line('2026-08', 'Regalos')).toMatchObject({
        totalCents: -2500 + 1250,
        reimbursedCents: 1250,
      });
      expect(line('2026-08', 'Comida')).toMatchObject({
        totalCents: -1500 + 750,
        reimbursedCents: 750,
      });
      expect(monthReport(db, '2026-08').balanceCents).toBe(-10000 + 5000);
      expect(monthReport(db, '2026-08').pendingReimbursementCents).toBe(0);
    });

    it('enseña cada trozo del Bizum debajo de su submovimiento', () => {
      expect(
        line('2026-08', 'Hogar')?.movements.map((m) => [m.description, m.amountCents]),
      ).toEqual([
        ['LIMPIEZA', -6000],
        ['BIZUM SERGIO SUPER', 3000],
      ]);
      expect(
        line('2026-08', 'Comida')?.movements.map((m) => [m.description, m.amountCents]),
      ).toEqual([
        ['SUPER DEMO', -1500],
        ['BIZUM SERGIO SUPER', 750],
      ]);
      expect(summaryTransactionIds(db, '2026-08', 'gastos')).toEqual([3, 4]);
    });

    it('dividido entero, los céntimos del redondeo van al último submovimiento', () => {
      db.run('DELETE FROM transaction_splits WHERE transaction_id = 3');
      split(33, 3, -3333, 'A', 'Hogar');
      split(34, 3, -3333, 'B', 'Regalos');
      split(35, 3, -3334, 'C', 'Restaurantes');
      db.run('UPDATE reimbursements SET amount_cents = 4999 WHERE reimbursement_tx_id = 4');

      const reimbursed = (name: string) => line('2026-08', name)?.reimbursedCents;
      // 4999 · 3333 / 10000 = 1666 (y pico) en cada uno de los dos primeros.
      expect([reimbursed('Hogar'), reimbursed('Regalos'), reimbursed('Restaurantes')]).toEqual([
        1666,
        1666,
        4999 - 1666 - 1666,
      ]);
      expect(line('2026-08', 'Comida')).toMatchObject({ totalCents: 0, count: 0 });
      // El Bizum sigue siendo de 50 €: el céntimo sin repartir se queda en su propia línea.
      expect(monthReport(db, '2026-08').balanceCents).toBe(-10000 + 5000);
    });
  });

  describe('un Bizum de suministros dividido que devuelve cada factura con su parte', () => {
    beforeEach(() => {
      db.run(`INSERT INTO accounts (id, name, kind) VALUES (2, 'Hucha', 'ahorro')`);
      tx(5, '2026-07-03', -4000, 'FACTURA LUZ', 'Luz');
      tx(6, '2026-07-05', -2000, 'FACTURA AGUA', 'Hogar');
      tx(7, '2026-07-20', 9000, 'BIZUM SUMINISTROS', null);
      split(71, 7, 4000, 'LUZ', 'Luz');
      split(72, 7, 2000, 'AGUA', 'Hogar');
      const fromPart = (expense: number, part: number, cents: number) =>
        db.run(
          `INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, reimbursement_split_id,
             amount_cents)
           VALUES (?, 7, ?, ?)`,
          [expense, part, cents],
        );
      fromPart(5, 71, 4000);
      fromPart(6, 72, 2000);
    });

    it('cada parte devuelve su factura y lo no dividido se queda en el Bizum', () => {
      expect(line('2026-07', 'Luz')).toMatchObject({ totalCents: 0, reimbursedCents: 4000 });
      expect(line('2026-07', 'Hogar')).toMatchObject({ totalCents: 0, reimbursedCents: 2000 });
      const july = monthReport(db, '2026-07');
      expect(july.uncategorized).toMatchObject({ totalCents: 3000, count: 1 });
      expect(july.balanceCents).toBe(-4000 - 2000 + 9000);
    });

    it('enseña la parte del Bizum bajo su factura, y no la parte suelta', () => {
      expect(line('2026-07', 'Luz')?.movements.map((m) => [m.description, m.amountCents])).toEqual([
        ['FACTURA LUZ', -4000],
        ['BIZUM SUMINISTROS › LUZ', 4000],
      ]);
      expect(summaryTransactionIds(db, '2026-07', 'gastos')).toEqual([5, 6, 7]);
    });

    it('los submovimientos de la entrada de un traspaso no cuentan, como ella', () => {
      tx(8, '2026-07-10', -2000, 'A LA HUCHA', null);
      db.run(
        `INSERT INTO transactions (id, account_id, op_date, amount_cents, description,
           category_source, origin)
         VALUES (9, 2, '2026-07-10', 2000, 'A LA HUCHA', 'ninguna', 'manual')`,
      );
      db.run('INSERT INTO transfers (outgoing_tx_id, incoming_tx_id) VALUES (8, 9)');
      split(91, 9, 1000, 'VIAJE', 'Nómina');
      const july = monthReport(db, '2026-07');
      expect(july.incomeCents).toBe(0);
      expect(july.balanceCents).toBe(-4000 - 2000 + 9000 - 2000);
      expect(summaryTransactionIds(db, '2026-07', 'ingresos')).toEqual([]);
    });
  });
});
