import {
  ConceptRuleError,
  conceptRuleError,
  conceptRuleErrorCode,
  isConceptRuleOperator,
  isConceptRuleScope,
  rewriteDescription,
  type ConceptRule,
} from './concept-rule';

const rule = (
  id: number,
  operator: ConceptRule['operator'],
  pattern: string,
  replacement: string,
  extra: Partial<ConceptRule> = {},
): ConceptRule => ({
  id,
  operator,
  pattern,
  scope: 'coincidencia',
  replacement,
  enabled: true,
  ...extra,
});

const rewrite = (rules: readonly ConceptRule[], text: string) =>
  rewriteDescription(rules, text).text;

describe('rewriteDescription', () => {
  it('«contiene» borra lo que coincide y deja el resto sin espacios sobrantes', () => {
    const rules = [rule(1, 'contiene', 'ES12 3456', '')];
    expect(rewrite(rules, 'TRANSFERENCIA A ES12   3456 ALQUILER')).toBe('TRANSFERENCIA A ALQUILER');
  });

  it('«contiene» no distingue mayúsculas ni acentos y sustituye todas las apariciones', () => {
    const rules = [rule(1, 'contiene', 'cafe', 'Café')];
    expect(rewrite(rules, 'CAFÉ Y CAFE')).toBe('Café Y Café');
  });

  it('«contiene» toma el texto literalmente, sin significado de expresión', () => {
    expect(rewrite([rule(1, 'contiene', 'A.B', '$&X')], 'AXB A.B')).toBe('AXB $&X');
  });

  it('puede sustituir el concepto entero', () => {
    const rules = [rule(1, 'contiene', 'AMAZON-', 'Amazon compra', { scope: 'concepto' })];
    expect(rewrite(rules, 'AMAZON-192903812-022')).toBe('Amazon compra');
  });

  it('«exacto» exige el concepto entero y lo sustituye', () => {
    const rules = [rule(1, 'exacto', 'nomina', 'Nómina')];
    expect(rewrite(rules, ' NÓMINA ')).toBe('Nómina');
    expect(rewrite(rules, 'NOMINA EMPRESA')).toBe('NOMINA EMPRESA');
  });

  it('una expresión regular admite grupos en la sustitución', () => {
    const rules = [rule(1, 'regex', String.raw`AMAZON-(\d+)-\d+`, 'Amazon $1')];
    expect(rewrite(rules, 'COMPRA AMAZON-192903812-022')).toBe('COMPRA Amazon 192903812');
  });

  it('aplica las reglas en orden, cada una sobre lo que deja la anterior', () => {
    const rules = [
      rule(1, 'contiene', '5402XXXXXXXX6019', ''),
      rule(2, 'exacto', 'COMPRA TARJ. MERCADO', 'Mercado'),
      rule(3, 'contiene', 'NADA', 'OTRA'),
    ];
    expect(rewriteDescription(rules, 'COMPRA TARJ. 5402XXXXXXXX6019 MERCADO')).toEqual({
      text: 'Mercado',
      ruleIds: [1, 2],
    });
  });

  it('no aplica una regla que dejaría el concepto vacío', () => {
    expect(rewrite([rule(1, 'contiene', 'BIZUM', '')], ' bizum ')).toBe(' bizum ');
  });

  it('ignora las reglas desactivadas y las expresiones que no compilan', () => {
    const rules = [rule(1, 'contiene', 'A', 'B', { enabled: false }), rule(2, 'regex', '(', 'C')];
    expect(rewriteDescription(rules, 'A')).toEqual({ text: 'A', ruleIds: [] });
  });
});

describe('conceptRuleError', () => {
  const base = { operator: 'contiene', pattern: 'AMAZON', scope: 'coincidencia' } as const;

  it('valida el texto como las reglas de categoría', () => {
    expect(conceptRuleError({ ...base, pattern: ' ', replacement: '' })).toBe('patron-vacio');
    expect(
      conceptRuleError({ ...base, operator: 'regex', pattern: '(a+)+', replacement: '' }),
    ).toBe('regex-peligrosa');
    expect(
      conceptRuleError({ ...base, replacement: '' }, [{ operator: 'contiene', pattern: 'amazon' }]),
    ).toBe('regla-repetida');
  });

  it('rechaza las expresiones que coinciden con un texto vacío', () => {
    expect(conceptRuleError({ ...base, operator: 'regex', pattern: 'X*', replacement: 'Y' })).toBe(
      'regex-vacia',
    );
  });

  it('exige sustitución cuando se cambia el concepto entero', () => {
    expect(conceptRuleError({ ...base, scope: 'concepto', replacement: ' ' })).toBe(
      'sustitucion-vacia',
    );
    expect(conceptRuleError({ ...base, operator: 'exacto', replacement: '' })).toBe(
      'sustitucion-vacia',
    );
    expect(conceptRuleError({ ...base, replacement: '' })).toBeNull();
    expect(conceptRuleError({ ...base, replacement: 'x'.repeat(201) })).toBe('sustitucion-larga');
  });
});

describe('utilidades', () => {
  it('reconoce los operadores, los alcances y los errores que cruzan entre hilos', () => {
    expect(isConceptRuleOperator('regex')).toBe(true);
    expect(isConceptRuleOperator('empieza')).toBe(false);
    expect(isConceptRuleScope('concepto')).toBe(true);
    expect(isConceptRuleScope('todo')).toBe(false);

    const crossed = Object.assign(new Error('sustitucion-vacia'), { name: 'ConceptRuleError' });
    expect(conceptRuleErrorCode(crossed)).toBe('sustitucion-vacia');
    expect(conceptRuleErrorCode(new ConceptRuleError('regla-inexistente'))).toBe(
      'regla-inexistente',
    );
    expect(conceptRuleErrorCode(new Error('regex-vacia'))).toBeNull();
  });
});
