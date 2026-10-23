import {
  suggestCategories,
  type CategorySuggestion,
  type SuggestionRequest,
} from '@domain/suggestions/category-suggestion';
import { trainClassifier } from '@domain/suggestions/history-classifier';
import type { SqlDb } from '../sql-db';
import { categoryOptions, findAccount, nullable, record, text } from './imports';
import { loadRules } from './rules';

/** Movimientos del historial de los que se aprende: los más recientes bastan y acotan el coste. */
const HISTORY_LIMIT = 5000;
const MAX_MOVEMENTS = 20_000;

/**
 * La categoría que se propone para cada movimiento del extracto (ADR-0018): la de la primera
 * regla que coincide o, si ninguna, la de los movimientos parecidos ya clasificados. Solo se
 * proponen subcategorías que se pueden asignar.
 */
export function suggestCategoriesFor(
  db: SqlDb,
  request: SuggestionRequest,
): (CategorySuggestion | null)[] {
  const assignable = new Set(categoryOptions(db).map((option) => option.id));
  // Se aprende del concepto del banco, como leen las reglas (ADR-0007).
  const history = db
    .rows(
      `SELECT coalesce(original_description, description) AS text, amount_cents, category_id
       FROM transactions
       WHERE category_id IS NOT NULL
       ORDER BY coalesce(booked_date, op_date) DESC, id DESC
       LIMIT ?`,
      [HISTORY_LIMIT],
    )
    .map((row) => ({
      text: String(row['text']),
      amountCents: Number(row['amount_cents']),
      categoryId: Number(row['category_id']),
    }))
    .filter((item) => assignable.has(item.categoryId));

  const accountId = findAccount(db, request)?.id ?? null;
  return suggestCategories(
    loadRules(db),
    trainClassifier(history),
    request.movements.map((movement) => ({ ...movement, accountId })),
  ).map((suggestion) => (suggestion && assignable.has(suggestion.categoryId) ? suggestion : null));
}

/** Los parámetros llegan de otro hilo: se comprueba su forma antes de tocar la BD. */
export function suggestionRequestParam(params: unknown): SuggestionRequest {
  const request = record(params);
  const movements = request['movements'];
  if (!Array.isArray(movements) || movements.length > MAX_MOVEMENTS) {
    throw new RangeError('Movimientos no válidos.');
  }
  return {
    institution: text(request, 'institution', 80),
    ibanLast4: nullable(request, 'ibanLast4', (v) => typeof v === 'string' && /^\d{4}$/.test(v)),
    movements: movements.map((value: unknown) => {
      const movement = record(value);
      const amountCents = movement['amountCents'];
      if (!Number.isSafeInteger(amountCents)) throw new RangeError('Importe no válido.');
      return { text: text(movement, 'text', 500), amountCents: amountCents as number };
    }),
  };
}
