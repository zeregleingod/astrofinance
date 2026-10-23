import type { Rule } from '../rules/rule';
import { suggestCategories } from './category-suggestion';
import { trainClassifier } from './history-classifier';

const rule = (id: number, pattern: string, extra: Partial<Rule> = {}): Rule => ({
  id,
  operator: 'contiene',
  pattern,
  categoryId: id * 10,
  enabled: true,
  sign: 'cualquiera',
  minAmountCents: null,
  maxAmountCents: null,
  accountId: null,
  ...extra,
});

const classifier = trainClassifier([
  { text: 'COMPRA TARJ. 4000XXXXXXXX0001 MERCADONA VALENCIA', amountCents: -2000, categoryId: 5 },
  { text: 'ADEUDO RECIBO LUZ DEMO', amountCents: -6909, categoryId: 6 },
]);

const query = (text: string, accountId: number | null = null) => ({
  text,
  amountCents: -1500,
  accountId,
});

describe('suggestCategories', () => {
  it('propone por las reglas primero y, si ninguna encaja, por el historial', () => {
    const suggestions = suggestCategories([rule(1, 'MERCADONA')], classifier, [
      query('COMPRA TARJ. 5402XXXXXXXX9999 MERCADONA ALZIRA'),
      query('ADEUDO RECIBO LUZ IBERDROLA'),
      query('FARMACIA LOPEZ'),
    ]);

    expect(suggestions).toEqual([
      { source: 'regla', categoryId: 10, ruleId: 1 },
      { source: 'sugerencia', categoryId: 6 },
      null,
    ]);
  });

  it('respeta el orden de las reglas y sus condiciones de cuenta', () => {
    const rules = [rule(1, 'LUZ', { accountId: 3 }), rule(2, 'RECIBO')];

    expect(suggestCategories(rules, classifier, [query('ADEUDO RECIBO LUZ', 3)])).toEqual([
      { source: 'regla', categoryId: 10, ruleId: 1 },
    ]);
    // En una cuenta que aún no existe no aplica ninguna regla limitada a una cuenta.
    expect(suggestCategories(rules, classifier, [query('ADEUDO RECIBO LUZ')])).toEqual([
      { source: 'regla', categoryId: 20, ruleId: 2 },
    ]);
  });

  it('sin reglas ni historial no propone nada', () => {
    expect(suggestCategories([], trainClassifier([]), [query('MERCADONA')])).toEqual([null]);
    expect(suggestCategories([], classifier, [])).toEqual([]);
  });
});
