import {
  filterTransactions,
  nextSort,
  normalizeSearch,
  sortTransactions,
  transactionTags,
  type TableLabels,
} from './transaction-table';
import type { TransactionRow } from './transaction-row';

const labels: TableLabels = {
  shared: 'Compartido',
  reimbursement: 'Reembolso',
  transfer: 'Traspaso',
  installment: 'Cuota',
  uncategorized: 'Sin categoría',
};

function row(overrides: Partial<TransactionRow> & Pick<TransactionRow, 'id'>): TransactionRow {
  return {
    opDate: '2026-09-10',
    bookedDate: '2026-09-10',
    dateChanged: false,
    period: '2026-09',
    description: 'Movimiento',
    note: null,
    amountCents: -100,
    accountName: 'Cuenta principal',
    categoryName: 'Variables',
    subcategoryName: 'Comida',
    shared: false,
    reimbursement: false,
    transfer: false,
    installment: null,
    ...overrides,
  };
}

const rows = [
  row({
    id: 1,
    bookedDate: '2026-09-28',
    description: 'Tienda de muebles - Cortinas',
    amountCents: -13093,
    shared: true,
    subcategoryName: 'Hogar',
  }),
  row({
    id: 2,
    bookedDate: '2026-09-02',
    description: 'Financiación cocina',
    amountCents: -5049,
    installment: '10/10',
    categoryName: 'Préstamos y financiaciones',
    subcategoryName: 'Financiaciones',
  }),
  row({
    id: 3,
    bookedDate: '2026-09-28',
    opDate: '2026-10-03',
    dateChanged: true,
    description: 'Bizum recibido - Alex',
    amountCents: 6547,
    reimbursement: true,
    note: 'Llega en octubre',
  }),
  row({
    id: 4,
    bookedDate: '2026-09-26',
    description: 'Ávila Ocio',
    amountCents: 2500,
    categoryName: null,
    subcategoryName: null,
  }),
];

const ids = (list: readonly TransactionRow[]) => list.map((r) => r.id);

describe('transactionTags', () => {
  it('devuelve las etiquetas en orden fijo', () => {
    expect(
      transactionTags(row({ id: 9, shared: true, installment: '10/10', transfer: true }), labels),
    ).toEqual(['Compartido', 'Traspaso', 'Cuota 10/10']);
    expect(transactionTags(row({ id: 9 }), labels)).toEqual([]);
  });
});

describe('normalizeSearch', () => {
  it('ignora mayúsculas, tildes y espacios repetidos', () => {
    expect(normalizeSearch('  Financiación   ÁVILA ')).toBe('financiacion avila');
  });
});

describe('filterTransactions', () => {
  const search = (query: string) => ids(filterTransactions(rows, query, labels));

  it('sin texto devuelve todo', () => {
    expect(search('')).toEqual([1, 2, 3, 4]);
    expect(search('   ')).toEqual([1, 2, 3, 4]);
  });

  it('busca en descripción, categoría, subcategoría, cuenta y observaciones sin tildes', () => {
    expect(search('financiacion')).toEqual([2]);
    expect(search('avila')).toEqual([4]);
    expect(search('hogar')).toEqual([1]);
    expect(search('octubre')).toEqual([3]);
    expect(search('principal')).toEqual([1, 2, 3, 4]);
  });

  it('busca en etiquetas, en «Sin categoría» y en las fechas e importes tal y como se ven', () => {
    expect(search('reembolso')).toEqual([3]);
    expect(search('cuota 10/10')).toEqual([2]);
    expect(search('sin categoria')).toEqual([4]);
    expect(search('28/09')).toEqual([1, 3]);
    expect(search('03/10/2026')).toEqual([3]);
    expect(search('130,93')).toEqual([1]);
    expect(search('-50,49')).toEqual([2]);
  });

  it('exige todas las palabras', () => {
    expect(search('bizum alex')).toEqual([3]);
    expect(search('bizum cortinas')).toEqual([]);
  });
});

describe('sortTransactions', () => {
  const sort = (key: Parameters<typeof nextSort>[1], direction: 'asc' | 'desc') =>
    ids(sortTransactions(rows, { key, direction }, labels));

  it('ordena por fecha imputada y desempata por id (más reciente primero)', () => {
    expect(sort('bookedDate', 'desc')).toEqual([3, 1, 4, 2]);
    expect(sort('bookedDate', 'asc')).toEqual([2, 4, 1, 3]);
  });

  it('ordena por fecha original', () => {
    expect(sort('opDate', 'desc')).toEqual([3, 4, 2, 1]);
  });

  it('ordena importes como números', () => {
    expect(sort('amount', 'asc')).toEqual([1, 2, 4, 3]);
    expect(sort('amount', 'desc')).toEqual([3, 4, 2, 1]);
  });

  it('ordena textos en español ignorando mayúsculas y tildes', () => {
    expect(sort('description', 'asc')).toEqual([4, 3, 2, 1]);
  });

  it('deja siempre al final las celdas vacías', () => {
    expect(sort('subcategory', 'asc')).toEqual([3, 2, 1, 4]);
    expect(sort('subcategory', 'desc')).toEqual([1, 2, 3, 4]);
    expect(sort('notes', 'desc')).toEqual([3, 4, 2, 1]);
    expect(sort('tags', 'asc')).toEqual([1, 2, 3, 4]);
  });

  it('no modifica la lista original', () => {
    const copy = [...rows];
    sortTransactions(rows, { key: 'amount', direction: 'asc' }, labels);
    expect(rows).toEqual(copy);
  });
});

describe('nextSort', () => {
  it('una columna nueva empieza ascendente y la misma alterna', () => {
    expect(nextSort({ key: 'bookedDate', direction: 'desc' }, 'amount')).toEqual({
      key: 'amount',
      direction: 'asc',
    });
    expect(nextSort({ key: 'amount', direction: 'asc' }, 'amount')).toEqual({
      key: 'amount',
      direction: 'desc',
    });
    expect(nextSort({ key: 'amount', direction: 'desc' }, 'amount')).toEqual({
      key: 'amount',
      direction: 'asc',
    });
  });
});
