import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { loadDemoData } from '../seeds/demo-data';
import { wrapDatabase, type SqlDb } from '../sql-db';
import { listPeriods, monthReport, monthTransactions } from './reports';

describe('consultas de informes (sobre la demo)', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    loadDemoData(db);
  });

  afterEach(() => raw.close());

  it('lista los periodos con movimientos en orden', () => {
    expect(listPeriods(db)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  describe('monthReport', () => {
    it('suma cada subcategoría neta de reembolsos y devoluciones', () => {
      const report = monthReport(db, '2026-07');
      const housing = report.groups.find((g) => g.name === 'Hipoteca y vivienda');
      expect(housing?.lines.map((l) => [l.name, l.totalCents])).toEqual([
        ['Cuota hipoteca', -41236 + 20956],
        ['Seguros de la vivienda', -677],
        ['Impuestos', -32050 + 16025],
      ]);
      expect(housing?.totalCents).toBe(-41236 + 20956 - 677 - 32050 + 16025);
    });

    it('cuenta los traspasos a ahorro una sola vez (sin la pata de entrada)', () => {
      const report = monthReport(db, '2026-09');
      expect(report.savingsCents).toBe(-20000);
      expect(report.groups.find((g) => g.name === 'Ahorro')?.totalCents).toBe(-20000);
    });

    it('incluye en septiembre los reembolsos imputados que llegan en octubre', () => {
      const hogar = monthReport(db, '2026-09')
        .groups.find((g) => g.name === 'Variables')
        ?.lines.find((l) => l.name === 'Hogar');
      expect(hogar).toMatchObject({ totalCents: -13093 + 6547, count: 2 });
    });

    it('da ingresos, sin categoría y lo pendiente de cobrar del mes', () => {
      expect(monthReport(db, '2026-07').incomeCents).toBe(185000 + 12000);
      expect(monthReport(db, '2026-09').uncategorized).toEqual({ totalCents: 2500, count: 1 });
      expect(monthReport(db, '2026-08').pendingReimbursementCents).toBe(9210);
      expect(monthReport(db, '2026-09').pendingReimbursementCents).toBe(3929);
    });

    it('cuadra: el balance es la suma de todo lo imputado al mes salvo las entradas de traspasos', () => {
      const expected = db.value(
        `SELECT sum(amount_cents) FROM transactions
         WHERE period = '2026-08' AND id NOT IN (SELECT incoming_tx_id FROM transfers)`,
      );
      expect(monthReport(db, '2026-08').balanceCents).toBe(expected);
    });
  });

  describe('monthTransactions', () => {
    it('devuelve los movimientos imputados al mes, del más reciente al más antiguo', () => {
      const rows = monthTransactions(db, '2026-09');
      expect(rows[0]).toMatchObject({
        opDate: '2026-10-03',
        bookedDate: '2026-09-28',
        dateChanged: true,
        period: '2026-09',
        description: 'Bizum recibido - Alex - Cortinas',
        amountCents: 6547,
        categoryName: 'Variables',
        subcategoryName: 'Hogar',
        accountName: 'Cuenta principal',
        reimbursement: true,
        shared: false,
      });
      const dates = rows.map((r) => r.opDate);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('marca cuotas, gastos compartidos, traspasos y movimientos sin categoría', () => {
      const rows = monthTransactions(db, '2026-09');
      expect(rows.find((r) => r.description.startsWith('Financiación cocina'))).toMatchObject({
        installment: '10/10',
        shared: true,
      });
      expect(
        rows
          .filter((r) => r.transfer)
          .map((r) => r.accountName)
          .sort(),
      ).toEqual(['Cuenta principal', 'Cuenta principal', 'Hucha emergencias', 'Hucha viajes']);
      expect(rows.find((r) => r.categoryName === null)).toMatchObject({
        subcategoryName: null,
        amountCents: 2500,
      });
    });

    it('sin fecha imputada usa la original y no la marca como cambiada', () => {
      const rows = monthTransactions(db, '2026-09');
      const unchanged = rows.filter((r) => !r.dateChanged);
      expect(unchanged.length).toBe(rows.length - 2);
      expect(unchanged.every((r) => r.bookedDate === r.opDate)).toBe(true);
    });

    it('un movimiento asignado directamente a un grupo no tiene subcategoría', () => {
      db.run(
        `UPDATE transactions SET category_id = (SELECT id FROM categories WHERE name = 'Variables')
         WHERE description = 'Farmacia Centro' AND period = '2026-09'`,
      );
      expect(
        monthTransactions(db, '2026-09').find((r) => r.description === 'Farmacia Centro'),
      ).toMatchObject({ categoryName: 'Variables', subcategoryName: null });
    });
  });
});
