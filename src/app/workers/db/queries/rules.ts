import {
  RULE_OPERATORS,
  RuleError,
  cleanPattern,
  isRuleOperator,
  matchRules,
  rulePatternError,
  type NewRule,
  type Rule,
  type RuleCandidate,
  type RuleChange,
  type RuleMatch,
  type RuleOperator,
  type RuleRow,
  type RuleSign,
  type RuleUpdate,
} from '@domain/rules/rule';
import type { SqlDb } from '../sql-db';

/** Largo máximo del nombre interno de una regla en el esquema. */
const NAME_MAX = 80;

/** `Principal › Subcategoría`, o solo el nombre si la categoría no cuelga de otra. */
const CATEGORY_LABEL = `CASE WHEN p.id IS NULL THEN c.name ELSE p.name || ' › ' || c.name END`;

/** Las reglas en el orden en que se aplican, con los movimientos que ha clasificado cada una. */
export function listRules(db: SqlDb): RuleRow[] {
  return db
    .rows(
      `SELECT r.id, r.operator, r.pattern, r.category_id, ${CATEGORY_LABEL} AS category_label,
              (SELECT count(*) FROM transactions t WHERE t.rule_id = r.id) AS tx_count
       FROM rules r
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       ORDER BY r.priority, r.id`,
    )
    .map((row) => ({
      id: Number(row['id']),
      operator: operatorOf(row['operator']),
      pattern: String(row['pattern']),
      categoryId: Number(row['category_id']),
      categoryLabel: String(row['category_label']),
      transactionCount: Number(row['tx_count']),
    }));
}

/**
 * Da de alta una regla al final de la lista (la última en aplicarse) y devuelve su id. Lanza
 * `RuleError` si el texto no vale, la condición ya existe o la categoría no es asignable.
 */
export function createRule(db: SqlDb, input: NewRule): number {
  return db.transaction(() => {
    const pattern = requireValid(db, input, null);
    db.run(
      `INSERT INTO rules (name, priority, operator, pattern, category_id)
       SELECT ?, coalesce(max(priority), 0) + 1, ?, ?, ? FROM rules`,
      [pattern.trim().slice(0, NAME_MAX), input.operator, pattern, input.categoryId],
    );
    return db.lastInsertId();
  });
}

/** Cambia la condición o la categoría. Lo que la regla ya clasificó no se toca hasta aplicarla. */
export function updateRule(db: SqlDb, update: RuleUpdate): undefined {
  return db.transaction(() => {
    requireRule(db, update.id);
    const pattern = requireValid(db, update, update.id);
    db.run('UPDATE rules SET operator = ?, pattern = ?, category_id = ? WHERE id = ?', [
      update.operator,
      pattern,
      update.categoryId,
      update.id,
    ]);
    return undefined;
  });
}

/** Elimina la regla. Los movimientos que clasificó conservan su categoría. */
export function deleteRule(db: SqlDb, id: number): undefined {
  return db.transaction(() => {
    requireRule(db, id);
    db.run('DELETE FROM rules WHERE id = ?', [id]);
    return undefined;
  });
}

/**
 * Qué movimientos cambiarían de categoría si se aplicasen las reglas ahora, sin tocar nada: los
 * más recientes primero. Los clasificados a mano no se tocan nunca.
 */
export function previewRules(db: SqlDb): RuleChange[] {
  const matches = currentMatches(db);
  if (matches.length === 0) return [];

  const rules = new Map(listRules(db).map((rule) => [rule.id, rule]));
  const ruleOf = new Map(matches.map((match) => [match.transactionId, rules.get(match.ruleId)]));
  return db
    .rows(
      `SELECT t.id, coalesce(t.booked_date, t.op_date) AS shown_date, t.description,
              t.amount_cents,
              ${CATEGORY_LABEL} AS category_label
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE t.category_source <> 'manual'
       ORDER BY shown_date DESC, t.id DESC`,
    )
    .flatMap((row) => {
      const rule = ruleOf.get(Number(row['id']));
      if (!rule) return [];
      return {
        transactionId: Number(row['id']),
        date: String(row['shown_date']),
        description: String(row['description']),
        amountCents: Number(row['amount_cents']),
        currentCategory: row['category_label'] === null ? null : String(row['category_label']),
        newCategory: rule.categoryLabel,
        ruleOperator: rule.operator,
        rulePattern: rule.pattern,
      };
    });
}

/** Aplica las reglas a los movimientos que cambiarían, todos o ninguno. Devuelve cuántos. */
export function applyRules(db: SqlDb): number {
  return db.transaction(() => {
    const matches = currentMatches(db);
    for (const match of matches) {
      db.run(
        `UPDATE transactions
         SET category_id = ?, category_source = 'regla', rule_id = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND category_source <> 'manual'`,
        [match.categoryId, match.ruleId, match.transactionId],
      );
    }
    return matches.length;
  });
}

/** Todas las reglas, en el orden en que se aplican, tal como las usa el motor. */
export function loadRules(db: SqlDb): Rule[] {
  return db
    .rows(
      `SELECT id, operator, pattern, category_id, enabled, sign, min_amount_cents,
              max_amount_cents, account_id
       FROM rules ORDER BY priority, id`,
    )
    .map((row) => ({
      id: Number(row['id']),
      operator: operatorOf(row['operator']),
      pattern: String(row['pattern']),
      categoryId: Number(row['category_id']),
      enabled: Number(row['enabled']) === 1,
      sign: String(row['sign']) as RuleSign,
      minAmountCents: numberOrNull(row['min_amount_cents']),
      maxAmountCents: numberOrNull(row['max_amount_cents']),
      accountId: numberOrNull(row['account_id']),
    }));
}

function currentMatches(db: SqlDb): RuleMatch[] {
  const rules = loadRules(db);
  if (rules.length === 0) return [];

  // Las reglas leen el concepto del banco, que no cambia aunque se edite el visible (ADR-0007).
  const candidates: RuleCandidate[] = db
    .rows(
      `SELECT id, account_id, coalesce(original_description, description) AS text, amount_cents,
              category_id
       FROM transactions WHERE category_source <> 'manual'`,
    )
    .map((row) => ({
      id: Number(row['id']),
      accountId: Number(row['account_id']),
      text: String(row['text']),
      amountCents: Number(row['amount_cents']),
      categoryId: numberOrNull(row['category_id']),
    }));
  return matchRules(rules, candidates);
}

function requireRule(db: SqlDb, id: number): void {
  if (db.value('SELECT 1 FROM rules WHERE id = ?', [id]) === undefined) {
    throw new RuleError('regla-inexistente');
  }
}

/** Comprueba la regla contra las demás (sin contar `selfId`) y devuelve el texto a guardar. */
function requireValid(db: SqlDb, input: NewRule, selfId: number | null): string {
  const others = db
    .rows('SELECT operator, pattern FROM rules WHERE id IS NOT ?', [selfId])
    .map((row) => ({ operator: operatorOf(row['operator']), pattern: String(row['pattern']) }));
  const pattern = cleanPattern(input.operator, input.pattern);
  const error = rulePatternError(input.operator, pattern, others);
  if (error) throw new RuleError(error);

  // Solo las subcategorías se asignan a movimientos (ADR-0009).
  const assignable = db.value(
    'SELECT 1 FROM categories WHERE id = ? AND parent_id IS NOT NULL AND archived = 0',
    [input.categoryId],
  );
  if (assignable === undefined) throw new RuleError('categoria-inexistente');
  return pattern;
}

/** El esquema solo admite operadores conocidos; esto cubre datos imposibles. */
function operatorOf(value: unknown): RuleOperator {
  return isRuleOperator(value) ? value : RULE_OPERATORS[0];
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

type Fields = Readonly<Record<string, unknown>>;

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function newRuleParam(params: unknown): NewRule {
  const fields = record(params);
  const { operator, pattern } = fields;
  if (!isRuleOperator(operator)) throw invalid('operator');
  if (typeof pattern !== 'string') throw invalid('pattern');
  return { operator, pattern, categoryId: positiveId(fields['categoryId'], 'categoryId') };
}

export function ruleUpdateParam(params: unknown): RuleUpdate {
  return { ...newRuleParam(params), id: ruleIdParam(params) };
}

export function ruleIdParam(params: unknown): number {
  return positiveId(record(params)['id'], 'id');
}

function record(value: unknown): Fields {
  if (typeof value !== 'object' || value === null) throw invalid('forma');
  return value as Fields;
}

function positiveId(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw invalid(field);
  return Number(value);
}

const invalid = (field: string) => new RangeError(`Regla no válida (${field}).`);
