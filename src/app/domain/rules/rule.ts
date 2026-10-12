/** Cómo se compara el texto de la regla con el concepto del movimiento. */
export const RULE_OPERATORS = ['contiene', 'exacto', 'empieza', 'termina', 'regex'] as const;

export type RuleOperator = (typeof RULE_OPERATORS)[number];
export type RuleSign = 'cualquiera' | 'ingreso' | 'gasto';

export const RULE_PATTERN_MAX = 200;

/** Regla tal como la usa el motor (T1.6). */
export interface Rule {
  readonly id: number;
  readonly operator: RuleOperator;
  readonly pattern: string;
  readonly categoryId: number;
  readonly enabled: boolean;
  readonly sign: RuleSign;
  /** Límites sobre el valor absoluto del importe. */
  readonly minAmountCents: number | null;
  readonly maxAmountCents: number | null;
  /** Solo para los movimientos de esta cuenta; `null` = todas. */
  readonly accountId: number | null;
}

/** Regla tal como se lista: con el nombre de su categoría y los movimientos que ha clasificado. */
export interface RuleRow {
  readonly id: number;
  readonly operator: RuleOperator;
  readonly pattern: string;
  readonly categoryId: number;
  /** `Principal › Subcategoría`. */
  readonly categoryLabel: string;
  readonly transactionCount: number;
}

export interface NewRule {
  readonly operator: RuleOperator;
  readonly pattern: string;
  readonly categoryId: number;
}

export interface RuleUpdate extends NewRule {
  readonly id: number;
}

/** Movimiento que las reglas pueden clasificar: los que el usuario no ha clasificado a mano. */
export interface RuleCandidate {
  readonly id: number;
  readonly accountId: number;
  /** El concepto del banco, que no cambia aunque el usuario edite el que se muestra. */
  readonly text: string;
  readonly amountCents: number;
  readonly categoryId: number | null;
}

/** Categoría que una regla propone para un movimiento, distinta de la que tiene. */
export interface RuleMatch {
  readonly transactionId: number;
  readonly ruleId: number;
  readonly categoryId: number;
}

/** Un cambio propuesto, con lo necesario para enseñarlo antes de aplicarlo. */
export interface RuleChange {
  readonly transactionId: number;
  readonly date: string;
  readonly description: string;
  readonly amountCents: number;
  readonly currentCategory: string | null;
  readonly newCategory: string;
  readonly ruleOperator: RuleOperator;
  readonly rulePattern: string;
}

const PATTERN_ERROR_CODES = [
  'patron-vacio',
  'patron-largo',
  'regex-invalida',
  'regex-peligrosa',
  'regla-repetida',
] as const;

export const RULE_ERROR_CODES = [
  ...PATTERN_ERROR_CODES,
  'categoria-inexistente',
  'regla-inexistente',
] as const;

export type RulePatternErrorCode = (typeof PATTERN_ERROR_CODES)[number];
export type RuleErrorCode = (typeof RULE_ERROR_CODES)[number];

/** Error que impide guardar una regla. `message` es el código: sobrevive al paso entre hilos. */
export class RuleError extends Error {
  override readonly name = 'RuleError';

  constructor(readonly code: RuleErrorCode) {
    super(code);
  }
}

/** El código de un `RuleError`, también si ha cruzado entre hilos; si no, `null`. */
export function ruleErrorCode(error: unknown): RuleErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'RuleError') return null;
  return RULE_ERROR_CODES.find((code) => code === error.message) ?? null;
}

export function isRuleOperator(value: unknown): value is RuleOperator {
  return RULE_OPERATORS.some((operator) => operator === value);
}

/**
 * El texto tal como se guarda: en mayúsculas, como escriben los bancos los conceptos, y sin
 * espacios sobrantes. Una expresión regular se deja tal cual: en ella `\d` y `\D` no son lo mismo.
 */
export function cleanPattern(operator: RuleOperator, pattern: string): string {
  return operator === 'regex' ? pattern : pattern.trim().toLocaleUpperCase('es');
}

/**
 * Por qué no vale el texto de una regla, o `null` si vale. `others` son las demás reglas: dos
 * con la misma condición sobran, porque la segunda nunca llegaría a aplicarse.
 */
export function rulePatternError(
  operator: RuleOperator,
  pattern: string,
  others: readonly Pick<Rule, 'operator' | 'pattern'>[] = [],
): RulePatternErrorCode | null {
  if (pattern.trim() === '') return 'patron-vacio';
  if (pattern.length > RULE_PATTERN_MAX) return 'patron-largo';
  if (operator === 'regex') {
    try {
      new RegExp(pattern, REGEX_FLAGS);
    } catch {
      return 'regex-invalida';
    }
    if (hasNestedRepetition(pattern)) return 'regex-peligrosa';
  }
  const key = patternKey(operator, pattern);
  const repeated = others.some(
    (other) => other.operator === operator && patternKey(other.operator, other.pattern) === key,
  );
  return repeated ? 'regla-repetida' : null;
}

/**
 * Prueba en seco (T1.6): qué categoría recibiría cada movimiento, sin tocar nada. Las reglas
 * llegan en orden de prioridad y gana la primera que coincide. Solo se devuelven los
 * movimientos cuya categoría cambiaría; los que ninguna regla reconoce se quedan como están.
 */
export function matchRules(
  rules: readonly Rule[],
  candidates: readonly RuleCandidate[],
): RuleMatch[] {
  const active = rules
    .filter((rule) => rule.enabled)
    .map((rule) => ({ rule, test: matcher(rule) }));

  const matches: RuleMatch[] = [];
  for (const candidate of candidates) {
    const found = active.find(
      ({ rule, test }) => appliesTo(rule, candidate) && test(candidate.text),
    );
    if (found && found.rule.categoryId !== candidate.categoryId) {
      matches.push({
        transactionId: candidate.id,
        ruleId: found.rule.id,
        categoryId: found.rule.categoryId,
      });
    }
  }
  return matches;
}

/** Sin distinguir mayúsculas; `u` para que los rangos y clases entiendan acentos y eñes. */
const REGEX_FLAGS = 'iu';

/** Las condiciones de la regla que no son el texto: signo, cuenta e importe. */
function appliesTo(rule: Rule, candidate: RuleCandidate): boolean {
  if (rule.sign === 'ingreso' && candidate.amountCents <= 0) return false;
  if (rule.sign === 'gasto' && candidate.amountCents >= 0) return false;
  if (rule.accountId !== null && rule.accountId !== candidate.accountId) return false;
  const amount = Math.abs(candidate.amountCents);
  if (rule.minAmountCents !== null && amount < rule.minAmountCents) return false;
  return rule.maxAmountCents === null || amount <= rule.maxAmountCents;
}

function matcher(rule: Rule): (text: string) => boolean {
  if (rule.operator === 'regex') {
    try {
      const regex = new RegExp(rule.pattern, REGEX_FLAGS);
      return (text) => regex.test(text);
    } catch {
      // Una expresión que no compila (datos de otra versión) no clasifica nada.
      return () => false;
    }
  }
  const pattern = fold(rule.pattern);
  switch (rule.operator) {
    case 'contiene':
      return (text) => fold(text).includes(pattern);
    case 'exacto':
      return (text) => fold(text) === pattern;
    case 'empieza':
      return (text) => fold(text).startsWith(pattern);
    case 'termina':
      return (text) => fold(text).endsWith(pattern);
  }
}

/** Para comparar textos sin distinguir mayúsculas, acentos ni espacios repetidos. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function patternKey(operator: RuleOperator, pattern: string): string {
  return operator === 'regex' ? pattern : fold(pattern);
}

/**
 * Una repetición sin límite dentro de un grupo que también se repite sin límite, como `(a+)+`:
 * la forma más habitual de expresión que puede tardar una eternidad con ciertos textos. No
 * detecta todos los casos; el límite de longitud del patrón y del concepto acota el resto.
 */
function hasNestedRepetition(pattern: string): boolean {
  /** Por cada grupo abierto, si contiene alguna repetición sin límite. */
  const groups: boolean[] = [];
  let inClass = false;
  /** Lo último leído es el cierre de un grupo que contiene una repetición. */
  let afterRepeatingGroup = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      i++;
      afterRepeatingGroup = false;
    } else if (inClass) {
      inClass = char !== ']';
    } else if (char === '[') {
      inClass = true;
      afterRepeatingGroup = false;
    } else if (char === '(') {
      groups.push(false);
      afterRepeatingGroup = false;
    } else if (char === ')') {
      afterRepeatingGroup = groups.pop() ?? false;
      // El grupo que lo contiene también contiene esa repetición.
      if (afterRepeatingGroup && groups.length > 0) groups[groups.length - 1] = true;
    } else {
      const unbounded = char === '*' || char === '+' || /^\{\d*,\}/.test(pattern.slice(i));
      if (unbounded) {
        if (afterRepeatingGroup) return true;
        if (groups.length > 0) groups[groups.length - 1] = true;
      }
      afterRepeatingGroup = false;
    }
  }
  return false;
}
