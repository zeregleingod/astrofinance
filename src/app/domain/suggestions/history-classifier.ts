/**
 * Clasificador de conceptos bancarios que aprende de los movimientos ya clasificados (ADR-0018).
 * Cada concepto se convierte en un vector TF-IDF de palabras y trigramas de letras, y la
 * categoría sale de los vecinos más parecidos con el mismo signo. Sin modelos ni red: todo es
 * aritmética sobre el historial del usuario.
 */

/** Movimiento ya clasificado del que se aprende. */
export interface LabeledConcept {
  /** El concepto del banco. */
  readonly text: string;
  readonly amountCents: number;
  readonly categoryId: number;
}

export interface ConceptQuery {
  readonly text: string;
  readonly amountCents: number;
}

export interface HistorySuggestion {
  readonly categoryId: number;
  /** Entre 0 y 1: lo que se parece al vecino más cercano por lo de acuerdo que están todos. */
  readonly confidence: number;
}

/** Vecinos que votan. */
const NEIGHBOURS = 5;
/** Por debajo de este parecido (coseno) un concepto no se parece a ninguno. */
export const MIN_SIMILARITY = 0.5;
/** Parte de los votos que necesita la categoría ganadora. */
export const MIN_AGREEMENT = 0.6;
/** Las letras sueltas pesan menos que las palabras completas. */
const TRIGRAM_WEIGHT = 0.3;
/**
 * Lo que no aparece en el historial (otra ciudad, una sucursal nueva) cuenta a medias: algo
 * resta al parecido, pero un comercio conocido se sigue reconociendo.
 */
const UNSEEN_WEIGHT = 0.5;

/**
 * Palabras que ponen los bancos en conceptos de todo tipo y no dicen nada del comercio. Con
 * poco historial no se distinguen de un comercio, así que se quitan de antemano. Las de menos
 * de tres letras ya se descartan por su longitud.
 */
const NOISE = new Set([
  'abono',
  'adeudo',
  'cargo',
  'compra',
  'con',
  'del',
  'domiciliacion',
  'las',
  'los',
  'movil',
  'operacion',
  'pago',
  'por',
  'recibo',
  'tarj',
  'tarjeta',
  'transferencia',
]);

type Vector = ReadonlyMap<string, number>;

interface Example {
  readonly vector: Vector;
  readonly expense: boolean;
  readonly categoryId: number;
  /** Movimientos con este mismo concepto y categoría. */
  readonly count: number;
}

export interface HistoryClassifier {
  /** Para cada rasgo, los ejemplos que lo tienen. */
  readonly index: ReadonlyMap<string, readonly Example[]>;
  readonly idf: ReadonlyMap<string, number>;
  /** El peso de un rasgo que no aparece en el historial. */
  readonly unseenIdf: number;
}

/** Las palabras del concepto que sirven para reconocerlo, sin mayúsculas ni acentos. */
export function conceptTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (token) =>
        token.length >= 3 &&
        // Números, fechas, referencias y tarjetas enmascaradas (4000XXXXXXXX0001).
        !/\d/.test(token) &&
        !/xxx/.test(token) &&
        !NOISE.has(token),
    );
}

export function trainClassifier(history: readonly LabeledConcept[]): HistoryClassifier {
  // Los conceptos repetidos se cuentan una vez, con su número de apariciones.
  const grouped = new Map<string, { features: Vector; expense: boolean; categoryId: number }>();
  const counts = new Map<string, number>();
  for (const item of history) {
    const tokens = conceptTokens(item.text);
    if (tokens.length === 0) continue;
    const expense = item.amountCents < 0;
    const key = `${expense}|${item.categoryId}|${tokens.join(' ')}`;
    if (!grouped.has(key)) {
      grouped.set(key, { features: termFrequencies(tokens), expense, categoryId: item.categoryId });
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const documents = [...grouped.values()];
  const frequency = new Map<string, number>();
  for (const { features } of documents) {
    for (const feature of features.keys())
      frequency.set(feature, (frequency.get(feature) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [feature, df] of frequency) idf.set(feature, inverseFrequency(documents.length, df));
  const unseenIdf = UNSEEN_WEIGHT * inverseFrequency(documents.length, 0);

  const index = new Map<string, Example[]>();
  for (const [key, { features, expense, categoryId }] of grouped) {
    const vector = weigh(features, idf, unseenIdf);
    const example = { vector, expense, categoryId, count: counts.get(key) ?? 1 };
    for (const feature of vector.keys()) {
      const postings = index.get(feature) ?? [];
      postings.push(example);
      index.set(feature, postings);
    }
  }
  return { index, idf, unseenIdf };
}

/**
 * La categoría de los movimientos del historial que más se parecen, o `null` si ninguno se
 * parece lo bastante o no se ponen de acuerdo. Un gasto solo se compara con gastos y un ingreso
 * con ingresos.
 */
export function suggestFromHistory(
  classifier: HistoryClassifier,
  query: ConceptQuery,
): HistorySuggestion | null {
  const tokens = conceptTokens(query.text);
  if (tokens.length === 0) return null;
  const vector = weigh(termFrequencies(tokens), classifier.idf, classifier.unseenIdf);
  const expense = query.amountCents < 0;

  // Producto escalar con los ejemplos que comparten algún rasgo: los vectores son unitarios.
  const similarity = new Map<Example, number>();
  for (const [feature, weight] of vector) {
    for (const example of classifier.index.get(feature) ?? []) {
      if (example.expense !== expense) continue;
      similarity.set(
        example,
        (similarity.get(example) ?? 0) + weight * (example.vector.get(feature) ?? 0),
      );
    }
  }

  const neighbours = [...similarity]
    .filter(([, value]) => value >= MIN_SIMILARITY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, NEIGHBOURS);
  if (neighbours.length === 0) return null;

  const votes = new Map<number, number>();
  const closest = new Map<number, number>();
  let total = 0;
  for (const [{ categoryId, count }, value] of neighbours) {
    const vote = value * (1 + Math.log(count));
    votes.set(categoryId, (votes.get(categoryId) ?? 0) + vote);
    closest.set(categoryId, Math.max(closest.get(categoryId) ?? 0, value));
    total += vote;
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [categoryId, winner] = best;
  const agreement = winner / total;
  if (agreement < MIN_AGREEMENT) return null;
  return { categoryId, confidence: Math.min(1, agreement * (closest.get(categoryId) ?? 0)) };
}

/** Las palabras y los trigramas de cada palabra, con las veces que aparecen. */
function termFrequencies(tokens: readonly string[]): Vector {
  const features = new Map<string, number>();
  const add = (feature: string, weight: number) =>
    features.set(feature, (features.get(feature) ?? 0) + weight);
  for (const token of tokens) {
    add(token, 1);
    const padded = ` ${token} `;
    for (let i = 0; i + 3 <= padded.length; i++) add(`#${padded.slice(i, i + 3)}`, TRIGRAM_WEIGHT);
  }
  return features;
}

function inverseFrequency(documents: number, frequency: number): number {
  return Math.log((documents + 1) / (frequency + 1)) + 1;
}

/** TF-IDF normalizado a longitud 1, para que el producto escalar sea el coseno. */
function weigh(features: Vector, idf: ReadonlyMap<string, number>, unseenIdf: number): Vector {
  const weighted = new Map<string, number>();
  let norm = 0;
  for (const [feature, tf] of features) {
    const weight = tf * (idf.get(feature) ?? unseenIdf);
    weighted.set(feature, weight);
    norm += weight * weight;
  }
  norm = Math.sqrt(norm);
  for (const [feature, weight] of weighted) weighted.set(feature, weight / norm);
  return weighted;
}
