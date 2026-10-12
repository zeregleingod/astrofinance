import {
  RuleError,
  cleanPattern,
  isRuleOperator,
  matchRules,
  ruleErrorCode,
  rulePatternError,
  type Rule,
  type RuleCandidate,
  type RuleOperator,
} from './rule';

const rule = (id: number, operator: RuleOperator, pattern: string, extra: Partial<Rule> = {}) => ({
  id,
  operator,
  pattern,
  categoryId: id * 10,
  enabled: true,
  sign: 'cualquiera' as const,
  minAmountCents: null,
  maxAmountCents: null,
  accountId: null,
  ...extra,
});

const movement = (text: string, extra: Partial<RuleCandidate> = {}): RuleCandidate => ({
  id: 1,
  accountId: 1,
  text,
  amountCents: -1250,
  categoryId: null,
  ...extra,
});

/** La categoría que proponen las reglas para un movimiento, o `null` si no cambia. */
const propose = (rules: readonly Rule[], candidate: RuleCandidate) =>
  matchRules(rules, [candidate])[0]?.categoryId ?? null;

describe('matchRules', () => {
  it('«contiene» no distingue mayúsculas, acentos ni espacios repetidos', () => {
    const rules = [rule(1, 'contiene', 'supermercado barrio')];
    expect(propose(rules, movement('COMPRA TARJ. SUPERMERCADO   BARRIO 1234'))).toBe(10);
    expect(propose(rules, movement('Súpermercado Bárrio'))).toBe(10);
    expect(propose(rules, movement('SUPERMERCADO CENTRO'))).toBeNull();
  });

  it('«exacto» exige el concepto entero', () => {
    const rules = [rule(1, 'exacto', 'Nómina')];
    expect(propose(rules, movement(' NOMINA '))).toBe(10);
    expect(propose(rules, movement('NOMINA DE EMPRESA DEMO SL'))).toBeNull();
  });

  it('«empieza» y «termina» miran los extremos', () => {
    expect(propose([rule(1, 'empieza', 'bizum')], movement('BIZUM DE ALEX'))).toBe(10);
    expect(propose([rule(1, 'empieza', 'bizum')], movement('PAGO BIZUM'))).toBeNull();
    expect(propose([rule(1, 'termina', 'demo sl')], movement('NOMINA DE EMPRESA DEMO SL'))).toBe(
      10,
    );
    expect(propose([rule(1, 'termina', 'demo sl')], movement('DEMO SL NOMINA'))).toBeNull();
  });

  it('«regex» busca la expresión sin distinguir mayúsculas', () => {
    const rules = [rule(1, 'regex', '^recibo (luz|gas)\\b')];
    expect(propose(rules, movement('RECIBO LUZ DEMO'))).toBe(10);
    expect(propose(rules, movement('ADEUDO RECIBO LUZ'))).toBeNull();
    // Una expresión guardada que ya no compila no clasifica nada ni rompe las demás.
    expect(propose([rule(1, 'regex', '('), rule(2, 'contiene', 'luz')], movement('LUZ'))).toBe(20);
  });

  it('gana la primera regla que coincide, por orden', () => {
    const rules = [rule(1, 'contiene', 'demo'), rule(2, 'contiene', 'gasolinera')];
    expect(matchRules(rules, [movement('GASOLINERA DEMO', { id: 7 })])).toEqual([
      { transactionId: 7, ruleId: 1, categoryId: 10 },
    ]);
  });

  it('una regla desactivada no cuenta', () => {
    const rules = [
      rule(1, 'contiene', 'demo', { enabled: false }),
      rule(2, 'contiene', 'gasolinera'),
    ];
    expect(propose(rules, movement('GASOLINERA DEMO'))).toBe(20);
  });

  it('no propone nada si el movimiento ya tiene esa categoría', () => {
    const rules = [rule(1, 'contiene', 'luz')];
    expect(matchRules(rules, [movement('RECIBO LUZ', { categoryId: 10 })])).toEqual([]);
    expect(propose(rules, movement('RECIBO LUZ', { categoryId: 99 }))).toBe(10);
  });

  it('respeta el signo, la cuenta y el rango de importe de la regla', () => {
    const expense = [rule(1, 'contiene', 'bizum', { sign: 'gasto' })];
    expect(propose(expense, movement('BIZUM', { amountCents: -500 }))).toBe(10);
    expect(propose(expense, movement('BIZUM', { amountCents: 500 }))).toBeNull();

    const income = [rule(1, 'contiene', 'bizum', { sign: 'ingreso' })];
    expect(propose(income, movement('BIZUM', { amountCents: 500 }))).toBe(10);
    expect(propose(income, movement('BIZUM', { amountCents: -500 }))).toBeNull();

    const account = [rule(1, 'contiene', 'bizum', { accountId: 2 })];
    expect(propose(account, movement('BIZUM', { accountId: 2 }))).toBe(10);
    expect(propose(account, movement('BIZUM', { accountId: 1 }))).toBeNull();

    const range = [rule(1, 'contiene', 'bizum', { minAmountCents: 1000, maxAmountCents: 2000 })];
    expect(propose(range, movement('BIZUM', { amountCents: -1000 }))).toBe(10);
    expect(propose(range, movement('BIZUM', { amountCents: 2000 }))).toBe(10);
    expect(propose(range, movement('BIZUM', { amountCents: -999 }))).toBeNull();
    expect(propose(range, movement('BIZUM', { amountCents: -2001 }))).toBeNull();
  });
});

describe('rulePatternError', () => {
  it('exige un texto, y no demasiado largo', () => {
    expect(rulePatternError('contiene', '   ')).toBe('patron-vacio');
    expect(rulePatternError('contiene', 'a'.repeat(201))).toBe('patron-largo');
    expect(rulePatternError('contiene', 'a'.repeat(200))).toBeNull();
  });

  it('solo comprueba la sintaxis en las expresiones regulares', () => {
    expect(rulePatternError('contiene', '(')).toBeNull();
    expect(rulePatternError('regex', '(')).toBe('regex-invalida');
    expect(rulePatternError('regex', '^recibo (luz|gas)\\b')).toBeNull();
  });

  it('rechaza las repeticiones anidadas, que pueden no terminar nunca', () => {
    expect(rulePatternError('regex', '(a+)+$')).toBe('regex-peligrosa');
    expect(rulePatternError('regex', '(\\d*)*x')).toBe('regex-peligrosa');
    expect(rulePatternError('regex', '((ab){2,}c)+')).toBe('regex-peligrosa');
    expect(rulePatternError('regex', '(a+)?b+')).toBeNull();
    expect(rulePatternError('regex', '(a+)(b)+')).toBeNull();
    expect(rulePatternError('regex', '(a\\+)+ [(+*]+')).toBeNull();
    expect(rulePatternError('regex', '(a{2,3})+')).toBeNull();
  });

  it('rechaza una condición que ya tiene otra regla', () => {
    const others = [
      { operator: 'contiene', pattern: 'Súper  Barrio' },
      { operator: 'regex', pattern: '^Luz' },
    ] as const;
    expect(rulePatternError('contiene', 'super barrio', others)).toBe('regla-repetida');
    expect(rulePatternError('exacto', 'super barrio', others)).toBeNull();
    expect(rulePatternError('regex', '^Luz', others)).toBe('regla-repetida');
    expect(rulePatternError('regex', '^luz', others)).toBeNull();
  });
});

describe('utilidades', () => {
  it('reconoce el error aunque haya cruzado entre hilos', () => {
    const crossed = Object.assign(new Error('regla-repetida'), { name: 'RuleError' });
    expect(ruleErrorCode(crossed)).toBe('regla-repetida');
    expect(ruleErrorCode(new RuleError('regla-inexistente'))).toBe('regla-inexistente');
    expect(ruleErrorCode(new Error('regla-repetida'))).toBeNull();
    expect(ruleErrorCode(Object.assign(new Error('otro'), { name: 'RuleError' }))).toBeNull();
    expect(ruleErrorCode('regla-repetida')).toBeNull();
  });

  it('valida el operador y limpia el texto', () => {
    expect(isRuleOperator('exacto')).toBe(true);
    expect(isRuleOperator('parecido')).toBe(false);
    expect(cleanPattern('contiene', '  Luz de niño ')).toBe('LUZ DE NIÑO');
    expect(cleanPattern('regex', ' luz\\d ')).toBe(' luz\\d ');
  });
});
