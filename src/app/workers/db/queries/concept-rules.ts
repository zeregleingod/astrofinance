import {
  CONCEPT_RULE_OPERATORS,
  CONCEPT_RULE_SCOPES,
  ConceptRuleError,
  cleanReplacement,
  conceptRuleError,
  isConceptRuleOperator,
  isConceptRuleScope,
  rewriter,
  type ConceptChange,
  type ConceptRule,
  type ConceptRuleOperator,
  type ConceptRuleRow,
  type ConceptRuleScope,
  type ConceptRuleUpdate,
  type NewConceptRule,
} from '@domain/rules/concept-rule';
import { cleanPattern } from '@domain/rules/rule';
import type { SqlDb } from '../sql-db';

const MAX_TEXTS = 20_000;

/** Las reglas en el orden en que se aplican, con los movimientos cuyo concepto cambia cada una. */
export function listConceptRules(db: SqlDb): ConceptRuleRow[] {
  const rules = loadConceptRules(db);
  const counts = new Map<number, number>();
  const rewrite = rewriter(rules);
  for (const candidate of candidates(db)) {
    for (const id of rewrite(candidate.original).ruleIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return rules.map(({ id, operator, pattern, scope, replacement }) => ({
    id,
    operator,
    pattern,
    scope,
    replacement,
    transactionCount: counts.get(id) ?? 0,
  }));
}

/** Da de alta una regla al final de la lista y devuelve su id. */
export function createConceptRule(db: SqlDb, input: NewConceptRule): number {
  return db.transaction(() => {
    const rule = requireValid(db, input, null);
    db.run(
      `INSERT INTO concept_rules (priority, operator, pattern, scope, replacement)
       SELECT coalesce(max(priority), 0) + 1, ?, ?, ?, ? FROM concept_rules`,
      [rule.operator, rule.pattern, rule.scope, rule.replacement],
    );
    return db.lastInsertId();
  });
}

/** Cambia la regla. Los conceptos que ya cambió no se tocan hasta volver a aplicarlas. */
export function updateConceptRule(db: SqlDb, update: ConceptRuleUpdate): undefined {
  return db.transaction(() => {
    requireRule(db, update.id);
    const rule = requireValid(db, update, update.id);
    db.run(
      'UPDATE concept_rules SET operator = ?, pattern = ?, scope = ?, replacement = ? WHERE id = ?',
      [rule.operator, rule.pattern, rule.scope, rule.replacement, update.id],
    );
    return undefined;
  });
}

/** Elimina la regla. Los conceptos que cambió siguen así hasta volver a aplicar las reglas. */
export function deleteConceptRule(db: SqlDb, id: number): undefined {
  return db.transaction(() => {
    requireRule(db, id);
    db.run('DELETE FROM concept_rules WHERE id = ?', [id]);
    return undefined;
  });
}

/**
 * Qué conceptos cambiarían si se aplicasen las reglas ahora, sin tocar nada: los movimientos
 * más recientes primero. Los conceptos escritos a mano no se tocan nunca.
 */
export function previewConceptRules(db: SqlDb): ConceptChange[] {
  return currentChanges(db).sort(
    (a, b) => b.date.localeCompare(a.date) || b.transactionId - a.transactionId,
  );
}

/** Aplica las reglas a los conceptos que cambiarían, todos o ninguno. Devuelve cuántos. */
export function applyConceptRules(db: SqlDb): number {
  return db.transaction(() => {
    const changes = currentChanges(db);
    for (const change of changes) {
      // Sin ninguna regla que lo cambie, vuelve a ser el del banco.
      db.run(
        `UPDATE transactions
         SET description = ?,
             description_source = CASE WHEN ? IS original_description THEN 'banco' ELSE 'regla' END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND description_source <> 'manual'`,
        [change.newDescription, change.newDescription, change.transactionId],
      );
    }
    return changes.length;
  });
}

/** El concepto que dejan las reglas en cada texto, en el mismo orden (revisión de importación). */
export function rewriteDescriptions(db: SqlDb, texts: readonly string[]): string[] {
  const rewrite = rewriter(loadConceptRules(db));
  return texts.map((text) => rewrite(text).text);
}

/** Todas las reglas, en el orden en que se aplican, tal como las usa el motor. */
export function loadConceptRules(db: SqlDb): ConceptRule[] {
  return db
    .rows(
      `SELECT id, operator, pattern, scope, replacement, enabled
       FROM concept_rules ORDER BY priority, id`,
    )
    .map((row) => ({
      id: Number(row['id']),
      operator: operatorOf(row['operator']),
      pattern: String(row['pattern']),
      scope: scopeOf(row['scope']),
      replacement: String(row['replacement']),
      enabled: Number(row['enabled']) === 1,
    }));
}

interface Candidate {
  readonly id: number;
  readonly date: string;
  readonly amountCents: number;
  readonly description: string;
  readonly original: string;
}

/**
 * Movimientos cuyo concepto pueden cambiar las reglas: los que tienen concepto del banco y no
 * lo ha cambiado el usuario. Las reglas leen siempre el del banco (ADR-0007).
 */
function candidates(db: SqlDb): Candidate[] {
  return db
    .rows(
      `SELECT id, coalesce(booked_date, op_date) AS shown_date, amount_cents, description,
              original_description
       FROM transactions
       WHERE original_description IS NOT NULL AND description_source <> 'manual'`,
    )
    .map((row) => ({
      id: Number(row['id']),
      date: String(row['shown_date']),
      amountCents: Number(row['amount_cents']),
      description: String(row['description']),
      original: String(row['original_description']),
    }));
}

function currentChanges(db: SqlDb): ConceptChange[] {
  const rewrite = rewriter(loadConceptRules(db));
  return candidates(db).flatMap((candidate) => {
    const next = rewrite(candidate.original).text;
    if (next === candidate.description) return [];
    return {
      transactionId: candidate.id,
      date: candidate.date,
      amountCents: candidate.amountCents,
      currentDescription: candidate.description,
      newDescription: next,
    };
  });
}

function requireRule(db: SqlDb, id: number): void {
  if (db.value('SELECT 1 FROM concept_rules WHERE id = ?', [id]) === undefined) {
    throw new ConceptRuleError('regla-inexistente');
  }
}

/** Comprueba la regla contra las demás (sin contar `selfId`) y la devuelve tal como se guarda. */
function requireValid(db: SqlDb, input: NewConceptRule, selfId: number | null): NewConceptRule {
  const others = db
    .rows('SELECT operator, pattern FROM concept_rules WHERE id IS NOT ?', [selfId])
    .map((row) => ({ operator: operatorOf(row['operator']), pattern: String(row['pattern']) }));
  const rule: NewConceptRule = {
    operator: input.operator,
    pattern: cleanPattern(input.operator, input.pattern),
    // «Es exactamente» siempre cambia el concepto entero.
    scope: input.operator === 'exacto' ? 'concepto' : input.scope,
    replacement: cleanReplacement(input.replacement),
  };
  const error = conceptRuleError(rule, others);
  if (error) throw new ConceptRuleError(error);
  return rule;
}

/** El esquema solo admite valores conocidos; esto cubre datos imposibles. */
function operatorOf(value: unknown): ConceptRuleOperator {
  return isConceptRuleOperator(value) ? value : CONCEPT_RULE_OPERATORS[0];
}

function scopeOf(value: unknown): ConceptRuleScope {
  return isConceptRuleScope(value) ? value : CONCEPT_RULE_SCOPES[0];
}

type Fields = Readonly<Record<string, unknown>>;

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function newConceptRuleParam(params: unknown): NewConceptRule {
  const { operator, pattern, scope, replacement } = record(params);
  if (!isConceptRuleOperator(operator)) throw invalid('operator');
  if (typeof pattern !== 'string') throw invalid('pattern');
  if (!isConceptRuleScope(scope)) throw invalid('scope');
  if (typeof replacement !== 'string') throw invalid('replacement');
  return { operator, pattern, scope, replacement };
}

export function conceptRuleUpdateParam(params: unknown): ConceptRuleUpdate {
  return { ...newConceptRuleParam(params), id: conceptRuleIdParam(params) };
}

export function conceptRuleIdParam(params: unknown): number {
  const id = record(params)['id'];
  if (!Number.isSafeInteger(id) || Number(id) <= 0) throw invalid('id');
  return Number(id);
}

export function textsParam(params: unknown): string[] {
  const texts = record(params)['texts'];
  if (!Array.isArray(texts) || texts.length > MAX_TEXTS) throw invalid('texts');
  return texts.map((value: unknown) => {
    if (typeof value !== 'string' || value.length > 500) throw invalid('texts');
    return value;
  });
}

function record(value: unknown): Fields {
  if (typeof value !== 'object' || value === null) throw invalid('forma');
  return value as Fields;
}

const invalid = (field: string) => new RangeError(`Regla de concepto no válida (${field}).`);
