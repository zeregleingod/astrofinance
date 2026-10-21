import {
  TRANSACTION_TEXT_MAX,
  normalizeTransactionEdit,
  transactionEditErrors,
  type TransactionEdit,
} from './transaction-edit';

const edit = (extra: Partial<TransactionEdit> = {}): TransactionEdit => ({
  id: 1,
  description: 'Compra',
  bookedDate: '2026-09-28',
  categoryId: null,
  note: null,
  ...extra,
});

describe('transactionEditErrors', () => {
  it('acepta un cambio válido', () => {
    expect(transactionEditErrors(edit())).toEqual([]);
    expect(transactionEditErrors(edit({ note: 'x'.repeat(TRANSACTION_TEXT_MAX) }))).toEqual([]);
  });

  it('exige concepto, de 500 caracteres como máximo', () => {
    expect(transactionEditErrors(edit({ description: '   ' }))).toEqual(['description']);
    expect(transactionEditErrors(edit({ description: 'x'.repeat(501) }))).toEqual(['description']);
  });

  it('exige una fecha que exista', () => {
    expect(transactionEditErrors(edit({ bookedDate: '2026-02-30' }))).toEqual(['bookedDate']);
    expect(transactionEditErrors(edit({ bookedDate: '' }))).toEqual(['bookedDate']);
  });

  it('limita las observaciones', () => {
    expect(transactionEditErrors(edit({ note: 'x'.repeat(501) }))).toEqual(['note']);
  });
});

describe('normalizeTransactionEdit', () => {
  it('quita los espacios de los extremos y deja sin observación lo vacío', () => {
    expect(normalizeTransactionEdit(edit({ description: '  Luz  ', note: '   ' }))).toEqual(
      edit({ description: 'Luz', note: null }),
    );
    expect(normalizeTransactionEdit(edit({ note: ' Revisar ' })).note).toBe('Revisar');
  });
});
