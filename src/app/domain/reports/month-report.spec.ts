import { buildMonthReport, type CategoryTotalRow, type MonthMovementRow } from './month-report';

const row = (overrides: Partial<CategoryTotalRow> & Pick<CategoryTotalRow, 'id' | 'name'>) => ({
  parentId: null,
  kind: 'gasto' as const,
  color: null,
  totalCents: 0,
  count: 0,
  ...overrides,
});

describe('buildMonthReport', () => {
  const categories: CategoryTotalRow[] = [
    row({ id: 1, name: 'Ingresos', kind: 'ingreso', color: '#2E8B57' }),
    row({ id: 2, parentId: 1, name: 'Nómina', kind: 'ingreso', totalCents: 185000, count: 1 }),
    row({ id: 3, name: 'Ahorro', kind: 'ahorro' }),
    row({ id: 4, parentId: 3, name: 'Aportación', kind: 'ahorro', totalCents: -15000, count: 2 }),
    row({ id: 5, name: 'Variables', color: '#9C3A00', totalCents: -1000, count: 1 }),
    row({ id: 6, parentId: 5, name: 'Comida', totalCents: -5000, count: 3 }),
    row({ id: 7, parentId: 5, name: 'Ropa', color: '#B388EB', totalCents: 1800, count: 1 }),
  ];

  const report = buildMonthReport({
    period: '2026-09',
    categories,
    uncategorized: { totalCents: 2500, count: 1 },
    pendingReimbursementCents: 1964,
  });

  it('agrupa subcategorías bajo su grupo, en el orden recibido', () => {
    expect(report.groups.map((g) => g.name)).toEqual(['Ingresos', 'Ahorro', 'Variables']);
    expect(report.groups[2]?.lines.map((l) => l.name)).toEqual(['Variables', 'Comida', 'Ropa']);
  });

  it('suma al grupo sus movimientos directos y los de sus subcategorías', () => {
    expect(report.groups[2]?.totalCents).toBe(-1000 - 5000 + 1800);
    expect(report.groups[2]?.count).toBe(5);
  });

  it('solo muestra el propio grupo como línea si tiene movimientos directos', () => {
    expect(report.groups[0]?.lines.map((l) => l.name)).toEqual(['Nómina']);
  });

  it('el ahorro apartado se enseña en positivo, en su línea y en su bloque', () => {
    expect(report.groups[1]).toMatchObject({ name: 'Ahorro', totalCents: 15000 });
    expect(report.groups[1]?.lines).toMatchObject([{ name: 'Aportación', totalCents: 15000 }]);
    // Los gastos conservan su signo.
    expect(report.groups[2]?.lines.map((l) => l.totalCents)).toEqual([-1000, -5000, 1800]);
  });

  it('una retirada de ahorro resta del ahorro del mes', () => {
    const withdrawal = buildMonthReport({
      period: '2026-09',
      categories: [
        row({ id: 1, name: 'Ahorro', kind: null }),
        row({ id: 2, parentId: 1, name: 'Aportación', kind: 'ahorro', totalCents: -10000 }),
        row({ id: 3, parentId: 1, name: 'Retirada', kind: 'ahorro', totalCents: 4000 }),
      ],
      uncategorized: { totalCents: 0, count: 0 },
      pendingReimbursementCents: 0,
    });
    expect(withdrawal.savingsCents).toBe(6000);
    expect(withdrawal.groups[0]?.totalCents).toBe(6000);
    expect(withdrawal.groups[0]?.lines.map((l) => l.totalCents)).toEqual([10000, -4000]);
    expect(withdrawal.balanceCents).toBe(-6000);
  });

  it('sin ahorro el total es cero, no menos cero', () => {
    const empty = buildMonthReport({
      period: '2026-09',
      categories: [row({ id: 2, parentId: 1, name: 'Hucha', kind: 'ahorro' })],
      uncategorized: { totalCents: 0, count: 0 },
      pendingReimbursementCents: 0,
    });
    expect(Object.is(empty.savingsCents, 0)).toBe(true);
    expect(Object.is(empty.groups[0]?.totalCents, 0)).toBe(true);
  });

  it('las líneas heredan el color del grupo si no tienen uno propio', () => {
    expect(report.groups[2]?.lines.map((l) => l.color)).toEqual(['#9C3A00', '#9C3A00', '#B388EB']);
  });

  it('calcula ingresos, gastos, ahorro y balance (incluido lo no categorizado)', () => {
    expect(report).toMatchObject({
      period: '2026-09',
      incomeCents: 185000,
      expenseCents: -4200,
      savingsCents: 15000,
      balanceCents: 185000 - 4200 - 15000 + 2500,
      pendingReimbursementCents: 1964,
      uncategorized: { totalCents: 2500, count: 1, reimbursedCents: 0, movements: [] },
    });
  });

  it('trata como grupo una subcategoría cuyo padre no llega', () => {
    const orphan = buildMonthReport({
      period: '2026-09',
      categories: [row({ id: 9, parentId: 99, name: 'Huérfana', totalCents: -100, count: 1 })],
      uncategorized: { totalCents: 0, count: 0 },
      pendingReimbursementCents: 0,
    });
    expect(orphan.groups.map((g) => [g.name, g.totalCents])).toEqual([['Huérfana', -100]]);
  });

  describe('movimientos de cada línea', () => {
    const movement = (
      overrides: Partial<MonthMovementRow> & Pick<MonthMovementRow, 'key' | 'categoryId'>,
    ): MonthMovementRow => ({
      transactionId: 0,
      date: '2026-07-01',
      description: 'Movimiento',
      amountCents: -100,
      reimbursed: false,
      expenseKey: null,
      ...overrides,
    });
    const withMovements = buildMonthReport({
      period: '2026-07',
      categories: [
        row({ id: 1, name: 'Préstamos' }),
        row({ id: 2, parentId: 1, name: 'Financiaciones', totalCents: -16340, count: 4 }),
        row({ id: 3, name: 'Ahorro', kind: null }),
        row({ id: 4, parentId: 3, name: 'Hucha', kind: 'ahorro', totalCents: -10000, count: 1 }),
      ],
      uncategorized: { totalCents: 2500, count: 1 },
      pendingReimbursementCents: 0,
      movements: [
        movement({
          key: 't1',
          transactionId: 1,
          categoryId: 2,
          date: '2026-07-06',
          amountCents: -11192,
        }),
        movement({
          key: 't2',
          transactionId: 2,
          categoryId: 2,
          date: '2026-06-30',
          amountCents: -13592,
        }),
        // Llega antes que el gasto que devuelve, pero se enseña justo debajo de él.
        movement({
          key: 'r1',
          transactionId: 9,
          categoryId: 2,
          date: '2026-07-02',
          amountCents: 5596,
          reimbursed: true,
          expenseKey: 't1',
        }),
        movement({
          key: 'r2',
          transactionId: 9,
          categoryId: 2,
          date: '2026-07-02',
          amountCents: 6796,
          reimbursed: true,
          expenseKey: 't2',
        }),
        movement({ key: 't4', transactionId: 4, categoryId: 4, amountCents: -10000 }),
        movement({ key: 't5', transactionId: 5, categoryId: null, amountCents: 2500 }),
        // De una categoría que no está en la lista (archivada): no se enseña.
        movement({ key: 't6', transactionId: 6, categoryId: 99 }),
      ],
    });
    const lineOf = (name: string) =>
      withMovements.groups.flatMap((g) => g.lines).find((l) => l.name === name);

    it('ordena por fecha y pone cada reembolso justo debajo de su gasto', () => {
      expect(
        lineOf('Financiaciones')?.movements.map((m) => [m.key, m.amountCents, m.reimbursed]),
      ).toEqual([
        ['t2', -13592, false],
        ['r2', 6796, true],
        ['t1', -11192, false],
        ['r1', 5596, true],
      ]);
    });

    it('pone el Bizum de un submovimiento bajo ese submovimiento, no bajo sus hermanos', () => {
      const report = buildMonthReport({
        period: '2026-07',
        categories: [
          row({ id: 1, name: 'Variables' }),
          row({ id: 2, parentId: 1, name: 'Hogar', totalCents: -5000, count: 3 }),
        ],
        uncategorized: { totalCents: 0, count: 0 },
        pendingReimbursementCents: 0,
        movements: [
          movement({ key: 's1', transactionId: 7, categoryId: 2, amountCents: -3000 }),
          movement({ key: 's2', transactionId: 7, categoryId: 2, amountCents: -3000 }),
          movement({
            key: 'r5',
            transactionId: 8,
            categoryId: 2,
            amountCents: 1000,
            reimbursed: true,
            expenseKey: 's2',
          }),
        ],
      });
      expect(report.groups[0]?.lines[0]?.movements.map((m) => m.key)).toEqual(['s1', 's2', 'r5']);
    });

    it('el ahorro apartado se enseña en positivo también en sus movimientos', () => {
      expect(lineOf('Hucha')?.movements.map((m) => m.amountCents)).toEqual([10000]);
    });

    it('lo que no tiene categoría lleva sus propios movimientos', () => {
      expect(withMovements.uncategorized.movements.map((m) => m.key)).toEqual(['t5']);
    });

    it('sin movimientos las líneas salen vacías', () => {
      expect(report.groups.flatMap((g) => g.lines).every((l) => l.movements.length === 0)).toBe(
        true,
      );
    });
  });

  describe('lo devuelto por la otra persona', () => {
    const shared = buildMonthReport({
      period: '2026-06',
      categories: [
        row({ id: 1, name: 'Préstamos' }),
        // -111,92 de la cuota y 55,96 devueltos: el total ya es neto.
        row({ id: 2, parentId: 1, name: 'Financiaciones', totalCents: -5596, count: 2 }),
        row({ id: 3, parentId: 1, name: 'Otros', totalCents: -250, count: 1 }),
        row({ id: 4, name: 'Variables' }),
        row({ id: 5, parentId: 4, name: 'Comida', totalCents: -3000, count: 3 }),
      ].map((c) =>
        c.id === 2
          ? { ...c, reimbursedCents: 5596 }
          : c.id === 5
            ? { ...c, reimbursedCents: 2000 }
            : c,
      ),
      uncategorized: { totalCents: -1000, count: 2, reimbursedCents: 500 },
      pendingReimbursementCents: 0,
    });

    it('se separa en cada línea y en su bloque, ya incluido en el total', () => {
      expect(shared.groups[0]?.lines.map((l) => [l.name, l.totalCents, l.reimbursedCents])).toEqual(
        [
          ['Financiaciones', -5596, 5596],
          ['Otros', -250, 0],
        ],
      );
      expect(shared.groups[0]).toMatchObject({ totalCents: -5846, reimbursedCents: 5596 });
      expect(shared.groups[1]).toMatchObject({ totalCents: -3000, reimbursedCents: 2000 });
    });

    it('da lo devuelto en los gastos del mes: lo gastado es el gasto neto menos lo devuelto', () => {
      expect(shared.expenseCents).toBe(-5596 - 250 - 3000);
      expect(shared.reimbursedCents).toBe(5596 + 2000);
      expect(shared.uncategorized).toEqual({
        totalCents: -1000,
        count: 2,
        reimbursedCents: 500,
        movements: [],
      });
    });

    it('sin reembolsos lo devuelto es cero', () => {
      expect(report.reimbursedCents).toBe(0);
      expect(report.groups[2]?.lines.map((l) => l.reimbursedCents)).toEqual([0, 0, 0]);
      expect(report.uncategorized.reimbursedCents).toBe(0);
    });
  });
});
