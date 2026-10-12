import { buildMonthReport, type CategoryTotalRow } from './month-report';

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
      uncategorized: { totalCents: 2500, count: 1 },
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
});
