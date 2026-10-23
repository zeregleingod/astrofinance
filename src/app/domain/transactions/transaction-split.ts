import { TRANSACTION_TEXT_MAX } from './transaction-edit';

/**
 * Un submovimiento (ADR-0019): una parte de un movimiento que cuenta en su propia subcategoría.
 * Tiene el signo del movimiento; lo que no se divide se queda en el movimiento.
 */
export interface SplitLine {
  /** `null` si aún no está guardado. */
  readonly id: number | null;
  /** Obligatorio; se guarda en mayúsculas, como los conceptos del banco. */
  readonly description: string;
  /** Subcategoría, o `null` para dejarlo sin categoría. */
  readonly categoryId: number | null;
  /** Céntimos con el signo del movimiento. */
  readonly amountCents: number;
}

/** La lista entera de submovimientos de un movimiento: sustituye a la guardada. */
export interface TransactionSplits {
  readonly transactionId: number;
  readonly splits: readonly SplitLine[];
}

export type SplitLineError = 'description' | 'amount' | 'sign';

export interface SplitCheck {
  /** Los errores de cada línea, en el mismo orden. */
  readonly lines: readonly (readonly SplitLineError[])[];
  /** Las partes suman más que el movimiento. */
  readonly exceeds: boolean;
  /** Lo que queda en el movimiento, con su signo (positivo en un gasto si se pasa). */
  readonly unsplitCents: number;
  readonly valid: boolean;
}

/** Comprueba las partes de un movimiento de `parentCents`; una lista vacía es válida. */
export function checkSplits(parentCents: number, splits: readonly SplitLine[]): SplitCheck {
  const lines = splits.map((split) => lineErrors(parentCents, split));
  const unsplitCents = splits.reduce((rest, split) => rest - split.amountCents, parentCents);
  const exceeds = parentCents < 0 ? unsplitCents > 0 : unsplitCents < 0;
  return {
    lines,
    exceeds,
    unsplitCents,
    valid: !exceeds && lines.every((errors) => errors.length === 0),
  };
}

function lineErrors(parentCents: number, split: SplitLine): SplitLineError[] {
  const errors: SplitLineError[] = [];
  const description = split.description.trim();
  if (description === '' || description.length > TRANSACTION_TEXT_MAX) errors.push('description');
  if (!Number.isSafeInteger(split.amountCents) || split.amountCents === 0) errors.push('amount');
  else if (Math.sign(split.amountCents) !== Math.sign(parentCents)) errors.push('sign');
  return errors;
}

/** El submovimiento tal como se guarda: concepto sin espacios en los extremos y en mayúsculas. */
export function normalizeSplitLine(split: SplitLine): SplitLine {
  return { ...split, description: split.description.trim().toLocaleUpperCase('es') };
}

/** Lo que hay que hacer en la BD para pasar de los submovimientos guardados a los nuevos. */
export interface SplitSavePlan {
  readonly deletes: readonly number[];
  /** Primero los que bajan: la suma no pasa nunca del total por el camino. */
  readonly updates: readonly SplitLine[];
  readonly inserts: readonly SplitLine[];
}

export function splitSavePlan(
  current: readonly { readonly id: number; readonly amountCents: number }[],
  next: readonly SplitLine[],
): SplitSavePlan {
  const before = new Map(current.map((split) => [split.id, split.amountCents]));
  const kept = new Set<number>();
  for (const { id } of next) {
    if (id === null) continue;
    if (!before.has(id) || kept.has(id)) throw new RangeError(`Submovimiento no válido (${id}).`);
    kept.add(id);
  }
  // Cuánto crece cada parte en valor absoluto: las que menguan van antes.
  const growth = (split: SplitLine) =>
    Math.abs(split.amountCents) - Math.abs(before.get(split.id ?? 0) ?? 0);
  return {
    deletes: current.filter((split) => !kept.has(split.id)).map((split) => split.id),
    updates: next.filter((split) => split.id !== null).sort((a, b) => growth(a) - growth(b)),
    inserts: next.filter((split) => split.id === null),
  };
}
