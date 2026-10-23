/**
 * Una devolución (ADR-0021): parte de un ingreso (un Bizum, una transferencia) que devuelve un
 * gasto, p. ej. lo que cada amigo paga de una cena. Lo devuelto cuenta en la categoría y el mes
 * del gasto (ADR-0013); el gasto cuesta lo que queda.
 */
export interface RefundLink {
  /** El ingreso que devuelve. */
  readonly reimbursementTxId: number;
  /**
   * Si devuelve con uno de sus submovimientos (el Bizum de suministros dividido en luz, agua y
   * gas), cuál; `null` si con lo que el ingreso no ha dividido.
   */
  readonly reimbursementSplitId: number | null;
  /** Céntimos, en positivo. */
  readonly amountCents: number;
}

/** La lista entera de devoluciones de un gasto: sustituye a la guardada. */
export interface ExpenseRefunds {
  readonly expenseId: number;
  readonly links: readonly RefundLink[];
}

/** El origen de una devolución como clave: `"ingreso:"` o `"ingreso:submovimiento"`. */
export function refundSourceKey(source: {
  readonly reimbursementTxId: number;
  readonly reimbursementSplitId: number | null;
}): string {
  return `${source.reimbursementTxId}:${source.reimbursementSplitId ?? ''}`;
}

/** Un ingreso, o un submovimiento de un ingreso, que se puede vincular a un gasto (o ya lo está). */
export interface RefundCandidate {
  /** El ingreso. */
  readonly id: number;
  /** El submovimiento del ingreso; `null` si es lo que el ingreso no ha dividido. */
  readonly splitId: number | null;
  /** Fecha imputada, `AAAA-MM-DD`. */
  readonly date: string;
  /** El concepto del ingreso y, si es un submovimiento, el suyo: «BIZUM SUMINISTROS › LUZ». */
  readonly description: string;
  readonly accountName: string;
  /** El ingreso entero o el submovimiento. */
  readonly amountCents: number;
  /** Lo que tiene libre para este gasto: sin lo que devuelve de otros gastos o subcategorías. */
  readonly availableCents: number;
  /** Lo que ya devuelve de este gasto; `null` si no está vinculado. */
  readonly linkedCents: number | null;
}

/** El gasto y los ingresos que lo devuelven o pueden devolverlo, de fecha más cercana primero. */
export interface ExpenseRefundOptions {
  readonly expenseId: number;
  readonly candidates: readonly RefundCandidate[];
}

export type RefundLineError = 'amount' | 'available' | 'duplicate';

export interface RefundCheck {
  /** Los errores de cada devolución, en el mismo orden. */
  readonly lines: readonly (readonly RefundLineError[])[];
  readonly refundedCents: number;
  /** Lo que el gasto cuesta de verdad, en positivo; negativo si se devuelve de más. */
  readonly costCents: number;
  /** Se devuelve más de lo que costó. */
  readonly exceeds: boolean;
  readonly valid: boolean;
}

/**
 * Comprueba las devoluciones de un gasto de `expenseCents` (negativo). `available` da lo que
 * cada origen tiene libre, por su `refundSourceKey`; uno que no está no se puede vincular.
 */
export function checkRefunds(
  expenseCents: number,
  links: readonly RefundLink[],
  available: ReadonlyMap<string, number>,
): RefundCheck {
  const seen = new Set<string>();
  const lines = links.map((link) => {
    const errors: RefundLineError[] = [];
    const key = refundSourceKey(link);
    if (seen.has(key)) errors.push('duplicate');
    seen.add(key);
    if (!Number.isSafeInteger(link.amountCents) || link.amountCents <= 0) errors.push('amount');
    else if (link.amountCents > (available.get(key) ?? 0)) {
      errors.push('available');
    }
    return errors;
  });
  const refundedCents = links.reduce((sum, link) => sum + link.amountCents, 0);
  const costCents = Math.abs(expenseCents) - refundedCents;
  const exceeds = costCents < 0;
  return {
    lines,
    refundedCents,
    costCents,
    exceeds,
    valid: !exceeds && lines.every((errors) => errors.length === 0),
  };
}

/** Lo que hay que hacer en la BD para pasar de las devoluciones guardadas a las nuevas. */
export interface RefundSavePlan {
  /** Orígenes que dejan de devolver este gasto. */
  readonly deletes: readonly RefundLink[];
  /** Primero los que bajan: lo devuelto no pasa nunca del gasto por el camino. */
  readonly updates: readonly RefundLink[];
  readonly inserts: readonly RefundLink[];
}

export function refundSavePlan(
  current: readonly RefundLink[],
  next: readonly RefundLink[],
): RefundSavePlan {
  const before = new Map(current.map((link) => [refundSourceKey(link), link.amountCents]));
  const kept = new Set(next.map(refundSourceKey));
  const growth = (link: RefundLink) => link.amountCents - (before.get(refundSourceKey(link)) ?? 0);
  return {
    deletes: current.filter((link) => !kept.has(refundSourceKey(link))),
    updates: next
      .filter((link) => before.has(refundSourceKey(link)))
      .sort((a, b) => growth(a) - growth(b)),
    inserts: next.filter((link) => !before.has(refundSourceKey(link))),
  };
}
