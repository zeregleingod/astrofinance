import { buildYearReport, type YearCategory, type YearTotalRow } from './year-report';

const category = (overrides: Partial<YearCategory> & Pick<YearCategory, 'id' | 'name'>) => ({
  parentId: null,
  kind: 'gasto' as const,
  color: null,
  ...overrides,
});

const zeros = () => Array.from({ length: 12 }, () => 0);
const months = (values: Record<number, number>) => zeros().map((zero, i) => values[i + 1] ?? zero);

describe('buildYearReport', () => {
  const categories: YearCategory[] = [
    category({ id: 1, name: 'Ingresos', kind: null, color: '#2E8B57' }),
    category({ id: 2, parentId: 1, name: 'Nómina', kind: 'ingreso' }),
    category({ id: 3, name: 'Ahorro', kind: null }),
    category({ id: 4, parentId: 3, name: 'Aportación', kind: 'ahorro' }),
    category({ id: 5, name: 'Variables', kind: null, color: '#9C3A00' }),
    category({ id: 6, parentId: 5, name: 'Comida', kind: 'gasto' }),
    category({ id: 7, parentId: 5, name: 'Ropa', kind: 'gasto', color: '#B388EB' }),
  ];

  const totals: YearTotalRow[] = [
    { categoryId: 2, month: 1, totalCents: 185000, count: 1 },
    { categoryId: 2, month: 2, totalCents: 185000, count: 1 },
    { categoryId: 4, month: 1, totalCents: -20000, count: 1 },
    { categoryId: 6, month: 1, totalCents: -5000, count: 3 },
    { categoryId: 6, month: 2, totalCents: -4000, count: 2 },
    { categoryId: 7, month: 2, totalCents: 1800, count: 1 },
    { categoryId: null, month: 2, totalCents: 2500, count: 1 },
  ];

  const report = buildYearReport({ year: 2026, categories, totals });

  it('agrupa las subcategorías bajo su grupo, en el orden recibido', () => {
    expect(report.year).toBe(2026);
    expect(report.groups.map((g) => g.name)).toEqual(['Ingresos', 'Ahorro', 'Variables']);
    expect(report.groups[2]?.lines.map((l) => l.name)).toEqual(['Comida', 'Ropa']);
  });

  it('reparte cada línea en sus doce meses y da el total del año', () => {
    const comida = report.groups[2]?.lines[0];
    expect(comida?.months).toEqual(months({ 1: -5000, 2: -4000 }));
    expect(comida?.totalCents).toBe(-9000);
    expect(comida?.count).toBe(5);
  });

  it('las líneas sin movimientos salen a cero', () => {
    const empty = buildYearReport({ year: 2026, categories, totals: [] });
    expect(empty.groups[2]?.lines[1]).toMatchObject({ months: zeros(), totalCents: 0, count: 0 });
  });

  it('suma al grupo sus líneas mes a mes', () => {
    expect(report.groups[2]?.months).toEqual(months({ 1: -5000, 2: -4000 + 1800 }));
    expect(report.groups[2]?.totalCents).toBe(-5000 - 4000 + 1800);
  });

  it('da a cada grupo el tipo de sus subcategorías', () => {
    expect(report.groups.map((g) => g.kind)).toEqual(['ingreso', 'ahorro', 'gasto']);
  });

  it('un grupo con subcategorías de varios tipos, o sin ninguna, no tiene tipo', () => {
    const mixed = buildYearReport({
      year: 2026,
      categories: [
        category({ id: 1, name: 'Mezcla', kind: null }),
        category({ id: 2, parentId: 1, name: 'Nómina', kind: 'ingreso' }),
        category({ id: 3, parentId: 1, name: 'Comida', kind: 'gasto' }),
        category({ id: 4, name: 'Vacía', kind: null }),
      ],
      totals: [],
    });
    expect(mixed.groups.map((g) => g.kind)).toEqual([null, null]);
  });

  it('hereda el color del grupo salvo que la subcategoría tenga uno propio', () => {
    expect(report.groups[2]?.lines.map((l) => l.color)).toEqual(['#9C3A00', '#B388EB']);
  });

  it('el ahorro apartado se enseña en positivo', () => {
    expect(report.groups[1]?.lines[0]?.months[0]).toBe(20000);
    expect(report.savings).toEqual({ months: months({ 1: 20000 }), totalCents: 20000 });
  });

  it('da ingresos, gastos y balance por mes y del año', () => {
    expect(report.income).toEqual({ months: months({ 1: 185000, 2: 185000 }), totalCents: 370000 });
    expect(report.expense).toEqual({
      months: months({ 1: -5000, 2: -4000 + 1800 }),
      totalCents: -7200,
    });
    // El balance es todo lo imputado: también el ahorro apartado y lo que no tiene categoría.
    expect(report.balance.months).toEqual(
      months({ 1: 185000 - 20000 - 5000, 2: 185000 - 4000 + 1800 + 2500 }),
    );
    expect(report.balance.totalCents).toBe(185000 * 2 - 20000 - 5000 - 4000 + 1800 + 2500);
  });

  it('da también el balance sin el ahorro apartado, para el pie de la hoja anual', () => {
    expect(report.balanceWithoutSavings.months).toEqual(
      months({ 1: 185000 - 5000, 2: 185000 - 4000 + 1800 + 2500 }),
    );
    expect(report.balanceWithoutSavings.totalCents).toBe(185000 * 2 - 5000 - 4000 + 1800 + 2500);
  });

  it('separa lo que no tiene categoría', () => {
    expect(report.uncategorized).toEqual({
      months: months({ 2: 2500 }),
      totalCents: 2500,
      count: 1,
      reimbursed: { months: zeros(), totalCents: 0 },
    });
  });

  it('marca los meses con movimientos', () => {
    expect(report.monthsWithData).toEqual([true, true, ...Array.from({ length: 10 }, () => false)]);
  });

  it('el propio grupo es una línea más si tiene movimientos directos', () => {
    const direct = buildYearReport({
      year: 2026,
      categories,
      totals: [{ categoryId: 5, month: 3, totalCents: -700, count: 1 }],
    });
    expect(direct.groups[2]?.lines.map((l) => l.name)).toEqual(['Variables', 'Comida', 'Ropa']);
    expect(direct.groups[2]?.totalCents).toBe(-700);
  });

  it('una subcategoría cuyo grupo no está en la lista es un grupo propio', () => {
    const orphan = buildYearReport({
      year: 2026,
      categories: [category({ id: 9, parentId: 99, name: 'Suelta', kind: 'gasto' })],
      totals: [{ categoryId: 9, month: 12, totalCents: -100, count: 1 }],
    });
    expect(orphan.groups.map((g) => [g.name, g.totalCents])).toEqual([['Suelta', -100]]);
  });

  it('ignora los totales de categorías que no están en la lista (archivadas)', () => {
    const archived = buildYearReport({
      year: 2026,
      categories,
      totals: [{ categoryId: 42, month: 1, totalCents: -999, count: 1 }],
    });
    expect(archived.balance.totalCents).toBe(0);
    expect(archived.monthsWithData[0]).toBe(false);
  });

  describe('lo devuelto por la otra persona', () => {
    const shared = buildYearReport({
      year: 2026,
      categories,
      totals: [
        { categoryId: 6, month: 6, totalCents: -3000, count: 3, reimbursedCents: 2000 },
        { categoryId: 6, month: 7, totalCents: -1000, count: 1 },
        { categoryId: 7, month: 7, totalCents: -500, count: 2, reimbursedCents: 500 },
        { categoryId: null, month: 7, totalCents: 300, count: 1, reimbursedCents: 300 },
      ],
    });

    it('se separa mes a mes en cada línea y en su bloque, ya incluido en el total', () => {
      const [comida, ropa] = shared.groups[2]?.lines ?? [];
      expect(comida?.months).toEqual(months({ 6: -3000, 7: -1000 }));
      expect(comida?.reimbursed).toEqual({ months: months({ 6: 2000 }), totalCents: 2000 });
      expect(ropa?.reimbursed).toEqual({ months: months({ 7: 500 }), totalCents: 500 });
      expect(shared.groups[2]?.reimbursed).toEqual({
        months: months({ 6: 2000, 7: 500 }),
        totalCents: 2500,
      });
      expect(shared.groups[0]?.reimbursed.totalCents).toBe(0);
    });

    it('da lo devuelto en los gastos de cada mes y lo de los movimientos sin categoría', () => {
      expect(shared.reimbursed).toEqual({ months: months({ 6: 2000, 7: 500 }), totalCents: 2500 });
      expect(shared.uncategorized.reimbursed).toEqual({
        months: months({ 7: 300 }),
        totalCents: 300,
      });
    });
  });

  it('rechaza meses fuera de 1–12', () => {
    expect(() =>
      buildYearReport({
        year: 2026,
        categories,
        totals: [{ categoryId: 2, month: 13, totalCents: 1, count: 1 }],
      }),
    ).toThrow(RangeError);
  });
});
