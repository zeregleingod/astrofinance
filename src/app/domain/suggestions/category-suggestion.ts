import { matchRules, type Rule } from '../rules/rule';
import { suggestFromHistory, type HistoryClassifier } from './history-classifier';

/**
 * De dónde sale la categoría de un movimiento: la ha puesto el usuario, una regla o el
 * historial (ADR-0018), o no tiene.
 */
export type CategorySource = 'manual' | 'regla' | 'sugerencia' | 'ninguna';

/** Categoría que se propone para un movimiento que aún no la tiene. */
export type CategorySuggestion =
  | { readonly source: 'regla'; readonly categoryId: number; readonly ruleId: number }
  | { readonly source: 'sugerencia'; readonly categoryId: number };

export interface SuggestionQuery {
  /** El concepto del banco. */
  readonly text: string;
  readonly amountCents: number;
  /** La cuenta del movimiento; `null` si aún no existe (primera importación). */
  readonly accountId: number | null;
}

/** Lo que se pide al worker de BD para la revisión de una importación. */
export interface SuggestionRequest {
  /** La cuenta del extracto, para las reglas limitadas a una cuenta. */
  readonly institution: string;
  readonly ibanLast4: string | null;
  readonly movements: readonly Pick<SuggestionQuery, 'text' | 'amountCents'>[];
}

/** Ninguna cuenta tiene este id: las reglas limitadas a una cuenta no se aplican. */
const NO_ACCOUNT = 0;

/**
 * La categoría que se propone para cada movimiento, en el mismo orden: la de la primera regla
 * que coincide (ADR-0011) y, si ninguna, la de los movimientos parecidos ya clasificados.
 * `null` si no hay ninguna propuesta.
 */
export function suggestCategories(
  rules: readonly Rule[],
  classifier: HistoryClassifier,
  queries: readonly SuggestionQuery[],
): (CategorySuggestion | null)[] {
  const byRule = new Map(
    matchRules(
      rules,
      queries.map((query, id) => ({
        id,
        accountId: query.accountId ?? NO_ACCOUNT,
        text: query.text,
        amountCents: query.amountCents,
        categoryId: null,
      })),
    ).map((match) => [match.transactionId, match]),
  );

  return queries.map((query, i): CategorySuggestion | null => {
    const match = byRule.get(i);
    if (match) return { source: 'regla', categoryId: match.categoryId, ruleId: match.ruleId };
    const found = suggestFromHistory(classifier, query);
    return found && { source: 'sugerencia', categoryId: found.categoryId };
  });
}
