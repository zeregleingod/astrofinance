import type { MonthReport } from '@domain/reports/month-report';
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { migrate } from '../migrate';
import { MIGRATIONS } from '../migrations';
import { loadDemoData } from '../seeds/demo-data';
import { wrapDatabase, type SqlDb } from '../sql-db';
import {
  allTransactions,
  listPeriods,
  monthReport,
  monthTransactions,
  summaryTransactionIds,
  yearReport,
} from './reports';
import { SUMMARY_TOTALS } from '@domain/reports/summary-origin';

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
      // Un mismo Bizum devuelve la cuota y el seguro: cada parte cuenta en su gasto.
      expect(housing?.lines.map((l) => [l.name, l.totalCents, l.reimbursedCents])).toEqual([
        ['Cuota hipoteca', -41236 + 20618, 20618],
        ['Seguros de la vivienda', -677 + 338, 338],
        ['Impuestos', -32050 + 16025, 16025],
      ]);
      expect(housing?.totalCents).toBe(-41236 + 20956 - 677 - 32050 + 16025);
    });

    it('cuenta los traspasos a ahorro una sola vez (sin la pata de entrada)', () => {
      const report = monthReport(db, '2026-09');
      expect(report.savingsCents).toBe(20000);
      expect(report.groups.find((g) => g.name === 'Ahorro')?.totalCents).toBe(20000);
    });

    it('incluye en septiembre los reembolsos imputados que llegan en octubre', () => {
      const hogar = monthReport(db, '2026-09')
        .groups.find((g) => g.name === 'Variables')
        ?.lines.find((l) => l.name === 'Hogar');
      expect(hogar).toMatchObject({ totalCents: -13093 + 6547, count: 2 });
    });

    it('da ingresos, sin categoría y lo pendiente de cobrar del mes', () => {
      expect(monthReport(db, '2026-07').incomeCents).toBe(185000 + 12000);
      expect(monthReport(db, '2026-09').uncategorized).toMatchObject({
        totalCents: 2500,
        count: 1,
        reimbursedCents: 0,
      });
      // El seguro del hogar y la mitad de los organizadores del bazar (un submovimiento).
      expect(monthReport(db, '2026-08').pendingReimbursementCents).toBe(9210 + 440);
      expect(monthReport(db, '2026-09').pendingReimbursementCents).toBe(3929);
    });

    it('cada línea lleva sus movimientos, que suman su total', () => {
      for (const period of listPeriods(db)) {
        const report = monthReport(db, period);
        const lines = [...report.groups.flatMap((g) => g.lines), report.uncategorized];
        for (const line of lines) {
          const sum = line.movements.reduce((acc, m) => acc + m.amountCents, 0);
          expect(sum, period).toBe(line.totalCents);
          expect(line.movements.length, period).toBe(line.count);
        }
      }
    });

    it('cuadra: el balance es la suma de todo lo imputado al mes salvo las entradas de traspasos', () => {
      const expected = db.value(
        `SELECT sum(amount_cents) FROM transactions
         WHERE period = '2026-08' AND id NOT IN (SELECT incoming_tx_id FROM transfers)`,
      );
      expect(monthReport(db, '2026-08').balanceCents).toBe(expected);
    });
  });

  describe('yearReport', () => {
    it('cada mes del año cuadra con el resumen de ese mes', () => {
      const year = yearReport(db, 2026);
      for (const period of listPeriods(db)) {
        const month = monthReport(db, period);
        const i = Number(period.slice(5)) - 1;
        expect(year.income.months[i], period).toBe(month.incomeCents);
        expect(year.expense.months[i], period).toBe(month.expenseCents);
        expect(year.savings.months[i], period).toBe(month.savingsCents);
        expect(year.balance.months[i], period).toBe(month.balanceCents);
        expect(year.balanceWithoutSavings.months[i], period).toBe(
          month.balanceCents + month.savingsCents,
        );
        expect(year.uncategorized.months[i], period).toBe(month.uncategorized.totalCents);
        expect(
          year.groups.map((g) => [g.name, g.months[i]]),
          period,
        ).toEqual(month.groups.map((g) => [g.name, g.totalCents]));
      }
    });

    it('marca solo los meses con movimientos y suma el año', () => {
      const year = yearReport(db, 2026);
      expect(year.monthsWithData.flatMap((has, i) => (has ? [i + 1] : []))).toEqual([7, 8, 9]);
      const housing = year.groups.find((g) => g.name === 'Hipoteca y vivienda');
      expect(housing?.totalCents).toBe(
        ['2026-07', '2026-08', '2026-09']
          .map((p) => monthReport(db, p).groups.find((g) => g.name === 'Hipoteca y vivienda'))
          .reduce((acc, g) => acc + (g?.totalCents ?? 0), 0),
      );
    });

    it('un año sin movimientos sale a cero con todas las categorías', () => {
      const empty = yearReport(db, 2025);
      expect(empty.monthsWithData.some(Boolean)).toBe(false);
      expect(empty.balance.totalCents).toBe(0);
      expect(empty.groups.length).toBe(yearReport(db, 2026).groups.length);
    });
  });

  describe('summaryTransactionIds', () => {
    /** El movimiento de cada línea del resumen: el propio o, en una parte, su Bizum. */
    const transactionOf = (key: string) => {
      // `t12`, `s12`, `r12` o, el trozo de un Bizum en un submovimiento, `r12s3`.
      const id = Number.parseInt(key.slice(1), 10);
      if (key.startsWith('t')) return id;
      const sql = key.startsWith('s')
        ? 'SELECT transaction_id FROM transaction_splits WHERE id = ?'
        : 'SELECT reimbursement_tx_id FROM reimbursements WHERE id = ?';
      return Number(db.value(sql, [id]));
    };
    const kindOf = (categoryId: number) =>
      db.value('SELECT kind FROM categories WHERE id = ?', [categoryId]);
    const sorted = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => a - b);

    it('da los movimientos que el resumen del mes suma en cada total', () => {
      for (const period of listPeriods(db)) {
        const report = monthReport(db, period);
        const lines = report.groups.flatMap((g) => g.lines);
        const ofKind = (kind: string) =>
          sorted(
            lines
              .filter((l) => kindOf(l.id) === kind)
              .flatMap((l) => l.movements.map((m) => transactionOf(m.key))),
          );
        expect(summaryTransactionIds(db, period, 'ingresos'), period).toEqual(ofKind('ingreso'));
        expect(summaryTransactionIds(db, period, 'gastos'), period).toEqual(ofKind('gasto'));
        expect(summaryTransactionIds(db, period, 'ahorro'), period).toEqual(ofKind('ahorro'));
        expect(summaryTransactionIds(db, period, 'balance'), period).toEqual(
          sorted(
            [...lines.flatMap((l) => l.movements), ...report.uncategorized.movements].map((m) =>
              transactionOf(m.key),
            ),
          ),
        );
      }
    });

    it('lo pendiente de cobrar son los gastos compartidos del mes a los que les falta algo', () => {
      for (const period of listPeriods(db)) {
        const ids = summaryTransactionIds(db, period, 'pendiente');
        const pending = ids.length
          ? db.value(
              `SELECT sum(pending_cents)
               FROM (SELECT transaction_id, pending_cents FROM shared_expense_status
                     UNION ALL
                     SELECT transaction_id, pending_cents FROM shared_split_status)
               WHERE transaction_id IN (${ids.map(() => '?').join(', ')})`,
              ids,
            )
          : 0;
        expect(pending, period).toBe(monthReport(db, period).pendingReimbursementCents);
        expect(
          ids.every(
            (id) => db.value('SELECT period FROM transactions WHERE id = ?', [id]) === period,
          ),
          period,
        ).toBe(true);
      }
      expect(summaryTransactionIds(db, '2026-09', 'pendiente').length).toBeGreaterThan(0);
    });

    it('acepta todos los totales del resumen', () => {
      for (const total of SUMMARY_TOTALS) {
        expect(Array.isArray(summaryTransactionIds(db, '2026-09', total))).toBe(true);
      }
    });
  });

  describe('allTransactions', () => {
    it('devuelve los movimientos de todos los meses, del más reciente al más antiguo', () => {
      const rows = allTransactions(db);
      const byMonth = listPeriods(db).flatMap((period) => monthTransactions(db, period));

      expect(rows).toHaveLength(byMonth.length);
      expect(new Set(rows.map((r) => r.period))).toEqual(new Set(listPeriods(db)));
      const dates = rows.map((r) => r.opDate);
      expect(dates).toEqual([...dates].sort().reverse());
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

describe('consultas de informes: reembolsos repartidos', () => {
  let sqlite3: Sqlite3Static;
  let raw: Database;
  let db: SqlDb;

  const tx = (date: string, amount: number, category: number | null) => {
    db.run(
      `INSERT INTO transactions (account_id, op_date, amount_cents, description, category_id,
         category_source, origin)
       VALUES (1, ?, ?, 'Movimiento', ?, ?, 'manual')`,
      [date, amount, category, category === null ? 'ninguna' : 'manual'],
    );
    return Number(db.value('SELECT last_insert_rowid()'));
  };
  const share = (expense: number, cents: number) =>
    db.run(
      'INSERT INTO shared_expenses (transaction_id, person_id, expected_cents) VALUES (?, 1, ?)',
      [expense, cents],
    );
  const toExpense = (bizum: number, expense: number, cents: number) =>
    db.run(
      'INSERT INTO reimbursements (expense_tx_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
      [expense, bizum, cents],
    );
  const toCategory = (bizum: number, category: number, cents: number) =>
    db.run(
      'INSERT INTO reimbursements (category_id, reimbursement_tx_id, amount_cents) VALUES (?, ?, ?)',
      [category, bizum, cents],
    );
  const line = (report: MonthReport, name: string) =>
    report.groups.flatMap((g) => g.lines).find((l) => l.name === name);

  beforeAll(async () => {
    sqlite3 = await sqlite3InitModule();
  });

  beforeEach(() => {
    raw = new sqlite3.oo1.DB(':memory:');
    db = wrapDatabase(raw);
    db.run('PRAGMA foreign_keys = ON');
    migrate(db, MIGRATIONS);
    db.run(`INSERT INTO categories (id, name, sort_order) VALUES (1, 'Préstamos', 1),
              (3, 'Variables', 2), (5, 'Ingresos', 0)`);
    db.run(`INSERT INTO categories (id, parent_id, name, kind) VALUES
              (2, 1, 'Financiaciones', 'gasto'), (4, 3, 'Comida', 'gasto'),
              (6, 5, 'Ingresos extra', 'ingreso')`);
    db.run(`INSERT INTO accounts (id, name, kind) VALUES (1, 'Cuenta', 'corriente')`);
    db.run(`INSERT INTO people (id, name) VALUES (1, 'Sergio')`);

    // Junio: la cuota de Cetelem, compartida a medias, y un gasto sin categoría compartido.
    const cetelem = tx('2026-06-05', -11192, 2);
    share(cetelem, 5596);
    const loose = tx('2026-06-10', -2000, null);
    share(loose, 1000);
    // Julio: la compra del mes y un Bizum de 120 € clasificado como ingreso extra, que se
    // reparte entre la cuota de junio y la comida; 24,04 € quedan sin repartir.
    tx('2026-07-01', -6000, 4);
    const bizum = tx('2026-07-02', 12000, 6);
    toExpense(bizum, cetelem, 5596);
    toCategory(bizum, 4, 4000);
    // Y otro Bizum, sin categoría, que devuelve entero el gasto suelto de junio.
    toExpense(tx('2026-07-03', 1000, null), loose, 1000);
  });

  afterEach(() => raw.close());

  it('lo enlazado a un gasto cuenta en su categoría y su mes, separado como devuelto', () => {
    const june = monthReport(db, '2026-06');
    expect(line(june, 'Financiaciones')).toMatchObject({
      totalCents: -11192 + 5596,
      reimbursedCents: 5596,
      count: 2,
    });
    expect(june.uncategorized).toMatchObject({
      totalCents: -1000,
      count: 2,
      reimbursedCents: 1000,
    });
    expect(june).toMatchObject({ expenseCents: -5596, reimbursedCents: 5596 });
    expect(june.pendingReimbursementCents).toBe(0);
  });

  it('lo repartido a una subcategoría cuenta en ella, en el mes del Bizum', () => {
    const july = monthReport(db, '2026-07');
    expect(line(july, 'Comida')).toMatchObject({
      totalCents: -6000 + 4000,
      reimbursedCents: 4000,
      count: 2,
    });
    expect(july).toMatchObject({ expenseCents: -2000, reimbursedCents: 4000 });
  });

  it('solo lo que queda sin repartir cuenta en la categoría del Bizum', () => {
    const july = monthReport(db, '2026-07');
    expect(line(july, 'Ingresos extra')).toMatchObject({
      totalCents: 12000 - 5596 - 4000,
      reimbursedCents: 0,
      count: 1,
    });
    expect(july.incomeCents).toBe(2404);
    // El Bizum repartido entero no deja nada en «Sin categoría».
    expect(july.uncategorized).toMatchObject({ totalCents: 0, count: 0, reimbursedCents: 0 });
  });

  it('los movimientos de cada línea incluyen las partes repartidas, bajo su gasto', () => {
    const june = monthReport(db, '2026-06');
    expect(
      line(june, 'Financiaciones')?.movements.map((m) => [m.date, m.amountCents, m.reimbursed]),
    ).toEqual([
      ['2026-06-05', -11192, false],
      ['2026-07-02', 5596, true],
    ]);
    expect(june.uncategorized.movements.map((m) => [m.amountCents, m.reimbursed])).toEqual([
      [-2000, false],
      [1000, true],
    ]);

    const july = monthReport(db, '2026-07');
    expect(line(july, 'Comida')?.movements.map((m) => [m.amountCents, m.reimbursed])).toEqual([
      [-6000, false],
      [4000, true],
    ]);
    // Del Bizum solo queda en su categoría lo que no se ha repartido.
    expect(line(july, 'Ingresos extra')?.movements.map((m) => m.amountCents)).toEqual([2404]);
    expect(july.uncategorized.movements).toEqual([]);
  });

  it('cada total lleva los Bizums que suman en él, aunque sean de otro mes', () => {
    const id = (date: string) =>
      Number(db.value('SELECT id FROM transactions WHERE op_date = ?', [date]));
    const [cetelem, loose, groceries, bizum, looseBizum] = [
      '2026-06-05',
      '2026-06-10',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ].map(id);
    const ids = (period: string, total: Parameters<typeof summaryTransactionIds>[2]) =>
      summaryTransactionIds(db, period, total);

    // Junio: la cuota y el Bizum de julio que la devuelve; el gasto suelto no tiene tipo.
    expect(ids('2026-06', 'gastos')).toEqual([cetelem, bizum].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(ids('2026-06', 'balance')).toEqual(
      [cetelem, loose, bizum, looseBizum].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
    expect(ids('2026-06', 'pendiente')).toEqual([]);
    // Julio: la compra y la parte del Bizum repartida a la comida; lo que queda, en ingresos.
    // El Bizum que devuelve entero el gasto de junio no suma nada en julio.
    expect(ids('2026-07', 'gastos')).toEqual([groceries, bizum]);
    expect(ids('2026-07', 'ingresos')).toEqual([bizum]);
    expect(ids('2026-07', 'balance')).toEqual([groceries, bizum]);
  });

  it('el dinero solo cambia de sitio: entre los meses el balance suma todos los movimientos', () => {
    const total = db.value('SELECT sum(amount_cents) FROM transactions');
    const balances = ['2026-06', '2026-07'].map((p) => monthReport(db, p).balanceCents);
    expect((balances[0] ?? 0) + (balances[1] ?? 0)).toBe(total);
  });

  it('la hoja anual reparte igual que los resúmenes mensuales', () => {
    const year = yearReport(db, 2026);
    for (const period of ['2026-06', '2026-07']) {
      const month = monthReport(db, period);
      const i = Number(period.slice(5)) - 1;
      expect(year.expense.months[i], period).toBe(month.expenseCents);
      expect(year.reimbursed.months[i], period).toBe(month.reimbursedCents);
      expect(year.balance.months[i], period).toBe(month.balanceCents);
      expect(year.uncategorized.reimbursed.months[i], period).toBe(
        month.uncategorized.reimbursedCents,
      );
      for (const name of ['Financiaciones', 'Comida', 'Ingresos extra']) {
        const yearLine = year.groups.flatMap((g) => g.lines).find((l) => l.name === name);
        expect(yearLine?.months[i], `${name} ${period}`).toBe(line(month, name)?.totalCents);
        expect(yearLine?.reimbursed.months[i], `${name} ${period}`).toBe(
          line(month, name)?.reimbursedCents,
        );
      }
    }
  });
});
