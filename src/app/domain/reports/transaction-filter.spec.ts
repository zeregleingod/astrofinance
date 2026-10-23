import {
  NO_FILTER,
  applyTransactionFilter,
  isFiltering,
  monthFilter,
  transactionFilterOptions,
  type TransactionFilter,
} from './transaction-filter';
import type { TransactionRow } from './transaction-row';

const row = (id: number, extra: Partial<TransactionRow> = {}): TransactionRow => ({
  id,
  opDate: '2026-01-10',
  bookedDate: '2026-01-10',
  dateChanged: false,
  period: '2026-01',
  description: `Movimiento ${id}`,
  note: null,
  amountCents: -1000,
  accountName: 'Cuenta principal',
  categoryName: 'Variables',
  subcategoryName: 'Comida',
  shared: false,
  reimbursement: false,
  transfer: false,
  installment: null,
  originalDescription: null,
  categoryId: null,
  splits: [],
  refundingCents: 0,
  refunds: [],
  refundable: false,
  ...extra,
});

const part = (
  description: string,
  categoryName: string | null,
  subcategoryName: string | null,
) => ({
  id: 1,
  description,
  amountCents: -100,
  categoryId: null,
  categoryName,
  subcategoryName,
  shared: false,
  refundsTo: [],
});

const ROWS: readonly TransactionRow[] = [
  row(1, { bookedDate: '2025-12-31', amountCents: -2500 }),
  row(2, {
    bookedDate: '2026-01-01',
    amountCents: 185000,
    categoryName: 'Ingresos',
    subcategoryName: 'Nómina',
  }),
  row(3, { bookedDate: '2026-01-15', shared: true, amountCents: -5000 }),
  row(4, {
    bookedDate: '2026-01-31',
    categoryName: 'Variables',
    subcategoryName: 'Otros',
    installment: '2/10',
  }),
  row(5, {
    bookedDate: '2026-02-01',
    categoryName: 'Fijos',
    subcategoryName: 'Otros',
    transfer: true,
    accountName: 'Ahorro',
  }),
  row(6, {
    bookedDate: '2026-02-10',
    categoryName: null,
    subcategoryName: null,
    reimbursement: true,
    amountCents: 5000,
  }),
  row(7, { bookedDate: '2026-03-01', categoryName: 'Fijos', subcategoryName: null }),
];

const ids = (filter: Partial<TransactionFilter>) =>
  applyTransactionFilter(ROWS, { ...NO_FILTER, ...filter }).map((r) => r.id);

describe('applyTransactionFilter', () => {
  it('sin criterios devuelve todo, en una lista nueva', () => {
    const result = applyTransactionFilter(ROWS, NO_FILTER);
    expect(result).toEqual(ROWS);
    expect(result).not.toBe(ROWS);
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_FILTER, account: 'Ahorro' })).toBe(true);
  });

  it('filtra por el año de la fecha imputada', () => {
    expect(ids({ year: 2025 })).toEqual([1]);
    expect(ids({ year: 2026 })).toEqual([2, 3, 4, 5, 6, 7]);
    expect(ids({ year: 2024 })).toEqual([]);
  });

  it('filtra por rango de fechas, con los extremos incluidos y cualquiera de ellos opcional', () => {
    expect(ids({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })).toEqual([2, 3, 4]);
    expect(ids({ dateFrom: '2026-02-10' })).toEqual([6, 7]);
    expect(ids({ dateTo: '2026-01-01' })).toEqual([1, 2]);
  });

  it('filtra por etiqueta', () => {
    expect(ids({ tag: 'shared' })).toEqual([3]);
    expect(ids({ tag: 'installment' })).toEqual([4]);
    expect(ids({ tag: 'transfer' })).toEqual([5]);
    expect(ids({ tag: 'reimbursement' })).toEqual([6]);
  });

  it('filtra por categoría, también por «sin categoría»', () => {
    expect(ids({ category: { name: 'Fijos' } })).toEqual([5, 7]);
    expect(ids({ category: { name: null } })).toEqual([6]);
  });

  it('una subcategoría es la de su categoría, no otra con el mismo nombre', () => {
    expect(ids({ subcategory: { category: 'Variables', name: 'Otros' } })).toEqual([4]);
    expect(ids({ subcategory: { category: 'Fijos', name: 'Otros' } })).toEqual([5]);
  });

  it('filtra por cuenta', () => {
    expect(ids({ account: 'Ahorro' })).toEqual([5]);
  });

  it('filtra por importe sin mirar el signo', () => {
    expect(ids({ minAmountCents: 5000 })).toEqual([2, 3, 6]);
    expect(ids({ maxAmountCents: 1000 })).toEqual([4, 5, 7]);
    expect(ids({ minAmountCents: 2500, maxAmountCents: 5000 })).toEqual([1, 3, 6]);
  });

  it('con varios criterios deben cumplirse todos', () => {
    expect(ids({ year: 2026, category: { name: 'Variables' }, maxAmountCents: 1000 })).toEqual([4]);
    expect(ids({ year: 2025, account: 'Ahorro' })).toEqual([]);
  });
});

describe('transactionFilterOptions', () => {
  it('ofrece solo lo que aparece en los movimientos, ordenado', () => {
    expect(transactionFilterOptions(ROWS)).toEqual({
      years: [2026, 2025],
      categories: ['Fijos', 'Ingresos', 'Variables'],
      uncategorized: true,
      subcategories: [
        { category: 'Fijos', name: 'Otros' },
        { category: 'Ingresos', name: 'Nómina' },
        { category: 'Variables', name: 'Comida' },
        { category: 'Variables', name: 'Otros' },
      ],
      accounts: ['Ahorro', 'Cuenta principal'],
    });
  });

  it('sin movimientos no hay nada que elegir', () => {
    expect(transactionFilterOptions([])).toEqual({
      years: [],
      categories: [],
      uncategorized: false,
      subcategories: [],
      accounts: [],
    });
  });
});

describe('monthFilter', () => {
  it('acota del primer al último día del mes', () => {
    expect(monthFilter('2026-01')).toEqual({
      ...NO_FILTER,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    expect(monthFilter('2026-02').dateTo).toBe('2026-02-28');
    expect(monthFilter('2028-02').dateTo).toBe('2028-02-29');
  });

  it('sin mes, o con uno que no vale, no filtra', () => {
    expect(monthFilter(undefined)).toBe(NO_FILTER);
    expect(monthFilter('2026-13')).toBe(NO_FILTER);
  });

  describe('con submovimientos', () => {
    const divided = row(20, {
      categoryName: 'Variables',
      subcategoryName: 'Comida',
      splits: [part('REGALO', 'Variables', 'Regalos'), part('PILAS', null, null)],
    });
    const rows = [row(21), divided];

    it('la etiqueta «Dividido» deja los que tienen submovimientos', () => {
      expect(applyTransactionFilter(rows, { ...NO_FILTER, tag: 'split' }).map((r) => r.id)).toEqual(
        [20],
      );
    });

    it('la subcategoría de un submovimiento encuentra su movimiento', () => {
      const filter: TransactionFilter = {
        ...NO_FILTER,
        subcategory: { category: 'Variables', name: 'Regalos' },
      };
      expect(applyTransactionFilter(rows, filter).map((r) => r.id)).toEqual([20]);
    });

    it('también la categoría, y un submovimiento sin categoría cuenta como «sin categoría»', () => {
      expect(
        applyTransactionFilter(rows, { ...NO_FILTER, category: { name: null } }).map((r) => r.id),
      ).toEqual([20]);
      expect(
        applyTransactionFilter(rows, { ...NO_FILTER, category: { name: 'Variables' } }).map(
          (r) => r.id,
        ),
      ).toEqual([21, 20]);
    });

    it('ofrece en los filtros las subcategorías de los submovimientos', () => {
      const options = transactionFilterOptions([divided]);
      expect(options.subcategories).toContainEqual({ category: 'Variables', name: 'Regalos' });
      expect(options.uncategorized).toBe(true);
    });
  });
});
