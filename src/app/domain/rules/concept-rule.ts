import { PATTERN_ERROR_CODES, fold, rulePatternError, type RuleOperator } from './rule';

/**
 * Cómo se compara el texto de una regla de concepto (ADR-0024). Mismo significado que en las
 * reglas de categoría; «empieza» y «termina» no hacen falta: una expresión regular los cubre.
 */
export const CONCEPT_RULE_OPERATORS = [
  'contiene',
  'exacto',
  'regex',
] as const satisfies readonly RuleOperator[];

export type ConceptRuleOperator = (typeof CONCEPT_RULE_OPERATORS)[number];

/** Qué se sustituye cuando la regla coincide: solo lo que coincide o el concepto entero. */
export const CONCEPT_RULE_SCOPES = ['coincidencia', 'concepto'] as const;

export type ConceptRuleScope = (typeof CONCEPT_RULE_SCOPES)[number];

/**
 * De dónde sale el concepto que se ve: el del banco tal cual, el que ha dejado una regla o el
 * que ha escrito el usuario. Las reglas solo tocan los dos primeros.
 */
export type DescriptionSource = 'banco' | 'regla' | 'manual';

export const REPLACEMENT_MAX = 200;
/** Como `description` en el esquema. */
const DESCRIPTION_MAX = 500;

/** Regla de concepto tal como la usa el motor. */
export interface ConceptRule {
  readonly id: number;
  readonly operator: ConceptRuleOperator;
  readonly pattern: string;
  readonly scope: ConceptRuleScope;
  /** Texto que se pone en su lugar; vacío para borrar lo que coincide. */
  readonly replacement: string;
  readonly enabled: boolean;
}

/** Regla tal como se lista: con los movimientos cuyo concepto cambia. */
export interface ConceptRuleRow {
  readonly id: number;
  readonly operator: ConceptRuleOperator;
  readonly pattern: string;
  readonly scope: ConceptRuleScope;
  readonly replacement: string;
  readonly transactionCount: number;
}

export interface NewConceptRule {
  readonly operator: ConceptRuleOperator;
  readonly pattern: string;
  readonly scope: ConceptRuleScope;
  readonly replacement: string;
}

export interface ConceptRuleUpdate extends NewConceptRule {
  readonly id: number;
}

/** Un concepto que cambiaría al aplicar las reglas, con lo necesario para enseñarlo. */
export interface ConceptChange {
  readonly transactionId: number;
  readonly date: string;
  readonly amountCents: number;
  readonly currentDescription: string;
  readonly newDescription: string;
}

/** El concepto que dejan las reglas y las que lo han cambiado, en orden. */
export interface Rewrite {
  readonly text: string;
  readonly ruleIds: readonly number[];
}

export const CONCEPT_RULE_ERROR_CODES = [
  ...PATTERN_ERROR_CODES,
  'regex-vacia',
  'sustitucion-vacia',
  'sustitucion-larga',
  'regla-inexistente',
] as const;

export type ConceptRuleErrorCode = (typeof CONCEPT_RULE_ERROR_CODES)[number];

/** Error que impide guardar una regla de concepto; `message` es el código, como en `RuleError`. */
export class ConceptRuleError extends Error {
  override readonly name = 'ConceptRuleError';

  constructor(readonly code: ConceptRuleErrorCode) {
    super(code);
  }
}

/** El código de un `ConceptRuleError`, también si ha cruzado entre hilos; si no, `null`. */
export function conceptRuleErrorCode(error: unknown): ConceptRuleErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'ConceptRuleError') return null;
  return CONCEPT_RULE_ERROR_CODES.find((code) => code === error.message) ?? null;
}

export function isConceptRuleOperator(value: unknown): value is ConceptRuleOperator {
  return CONCEPT_RULE_OPERATORS.some((operator) => operator === value);
}

export function isConceptRuleScope(value: unknown): value is ConceptRuleScope {
  return CONCEPT_RULE_SCOPES.some((scope) => scope === value);
}

/** «Es exactamente» siempre sustituye el concepto entero. */
export function effectiveScope(operator: ConceptRuleOperator, scope: ConceptRuleScope) {
  return operator === 'exacto' ? 'concepto' : scope;
}

/** La sustitución tal como se guarda: tal cual se escribe, sin espacios en los extremos. */
export function cleanReplacement(replacement: string): string {
  return replacement.trim();
}

/**
 * Por qué no vale una regla, o `null` si vale. El texto se comprueba como en las reglas de
 * categoría; además, una expresión que coincide con nada llenaría el concepto de sustituciones y
 * sustituir el concepto entero por nada lo dejaría vacío.
 */
export function conceptRuleError(
  rule: NewConceptRule,
  others: readonly Pick<ConceptRule, 'operator' | 'pattern'>[] = [],
): ConceptRuleErrorCode | null {
  const patternError = rulePatternError(rule.operator, rule.pattern, others);
  if (patternError) return patternError;
  if (rule.operator === 'regex' && new RegExp(rule.pattern, REGEX_FLAGS).test('')) {
    return 'regex-vacia';
  }
  const replacement = cleanReplacement(rule.replacement);
  if (replacement.length > REPLACEMENT_MAX) return 'sustitucion-larga';
  if (replacement === '' && effectiveScope(rule.operator, rule.scope) === 'concepto') {
    return 'sustitucion-vacia';
  }
  return null;
}

/**
 * Aplica las reglas a un concepto, en orden: cada una trabaja sobre lo que ha dejado la
 * anterior. Lo que coincide se compara sin distinguir mayúsculas, acentos ni espacios repetidos
 * (salvo en una expresión regular, que solo ignora las mayúsculas). El resultado no tiene
 * espacios repetidos ni en los extremos; una regla que lo dejaría vacío no se aplica.
 */
export function rewriteDescription(rules: readonly ConceptRule[], text: string): Rewrite {
  return rewriter(rules)(text);
}

/** `rewriteDescription` con las reglas ya preparadas, para muchos conceptos seguidos. */
export function rewriter(rules: readonly ConceptRule[]): (text: string) => Rewrite {
  const steps = rules
    .filter((rule) => rule.enabled)
    .map((rule) => ({ id: rule.id, apply: substitution(rule) }));

  return (text) => {
    let current = text;
    const ruleIds: number[] = [];
    for (const step of steps) {
      const next = step.apply(current);
      if (next === null) continue;
      const clean = tidy(next);
      if (clean !== '' && clean !== current) {
        current = clean;
        ruleIds.push(step.id);
      }
    }
    return { text: current, ruleIds };
  };
}

const REGEX_FLAGS = 'iu';

/** Lo que deja la regla en el texto, o `null` si no coincide. */
function substitution(rule: ConceptRule): (text: string) => string | null {
  if (rule.operator === 'exacto') {
    const pattern = fold(rule.pattern);
    return (text) => (fold(text) === pattern ? rule.replacement : null);
  }

  const isRegex = rule.operator === 'regex';
  let regex: RegExp;
  try {
    regex = isRegex ? new RegExp(rule.pattern, `g${REGEX_FLAGS}`) : looseRegex(rule.pattern);
  } catch {
    // Una expresión que no compila (datos de otra versión) no cambia nada.
    return () => null;
  }
  const wholeConcept = rule.scope === 'concepto';
  // En una expresión, `$1` y compañía insertan lo capturado; en un texto, todo es literal.
  const replace = isRegex
    ? (text: string) => text.replace(regex, rule.replacement)
    : (text: string) => text.replace(regex, () => rule.replacement);

  return (text) => {
    // El texto se busca en NFD, donde una letra con tilde es la letra más su tilde. La
    // expresión regular lee el concepto tal cual, como en las reglas de categoría.
    const source = isRegex ? text : text.normalize('NFD');
    regex.lastIndex = 0;
    if (!regex.test(source)) return null;
    regex.lastIndex = 0;
    return wholeConcept ? rule.replacement : replace(source).normalize('NFC');
  };
}

/**
 * Expresión que encuentra el texto en un concepto en NFD como lo compara `fold`: sin distinguir
 * mayúsculas ni acentos, y con cualquier número de espacios donde el texto tiene uno.
 */
function looseRegex(pattern: string): RegExp {
  const source = [...fold(pattern)]
    .map((char) => (char === ' ' ? '\\s+' : `${escapeRegex(char)}\\p{M}*`))
    .join('');
  return new RegExp(source, `g${REGEX_FLAGS}`);
}

function escapeRegex(char: string): string {
  // Con la bandera `u` solo se pueden escapar los caracteres con significado.
  return /[\\^$.*+?()[\]{}|/]/.test(char) ? `\\${char}` : char;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX);
}
