/** Una parte de un movimiento que cuenta en su propia subcategoría (ADR-0019). */
export interface SplitRow {
  readonly id: number;
  readonly description: string;
  /** Con el signo del movimiento. */
  readonly amountCents: number;
  readonly categoryId: number | null;
  /** Categoría padre; `null` si no tiene. */
  readonly categoryName: string | null;
  readonly subcategoryName: string | null;
  /** Compartida con otra persona, que devuelve su parte. */
  readonly shared: boolean;
  /**
   * Si es parte de un ingreso que devuelve gastos (ADR-0021), sus conceptos («FACTURA LUZ»);
   * vacío si no devuelve nada.
   */
  readonly refundsTo: readonly string[];
}

/** Un ingreso que devuelve parte de un gasto (ADR-0021), visto desde el gasto. */
export interface RefundRow {
  /** El ingreso (el Bizum, la transferencia). */
  readonly transactionId: number;
  /** Su fecha imputada. */
  readonly date: string;
  readonly description: string;
  /** Lo que devuelve de este gasto, en positivo. */
  readonly amountCents: number;
}

/**
 * Cómo se vincula un movimiento con otro (ADR-0022): lo devuelve un ingreso, devuelve un gasto o
 * es la otra pata de su traspaso.
 */
export type TransactionLinkKind = 'refundedBy' | 'refunds' | 'transfer';

/** Otro movimiento vinculado con este, visto desde este. */
export interface TransactionLink {
  readonly kind: TransactionLinkKind;
  readonly transactionId: number;
  /** Su fecha imputada. */
  readonly date: string;
  readonly description: string;
  readonly accountName: string;
  /**
   * En las devoluciones, lo devuelto entre los dos, en positivo; en un traspaso, el importe de
   * la otra pata, con su signo.
   */
  readonly amountCents: number;
}

/** Movimiento listo para mostrarse en la lista de movimientos. */
export interface TransactionRow {
  readonly id: number;
  /** Fecha original del movimiento (la del banco o la de alta). */
  readonly opDate: string;
  /** Fecha imputada: la que fija el usuario o, si no la ha cambiado, la original. */
  readonly bookedDate: string;
  /** El usuario ha imputado el movimiento a una fecha distinta de la original. */
  readonly dateChanged: boolean;
  /** Mes al que se imputa (el de `bookedDate`). */
  readonly period: string;
  readonly description: string;
  /** Concepto del banco, intacto; `null` en los movimientos creados a mano. */
  readonly originalDescription: string | null;
  readonly note: string | null;
  readonly amountCents: number;
  readonly accountName: string;
  /** Categoría padre (el bloque de la hoja mensual). */
  readonly categoryName: string | null;
  /** La categoría asignada (una subcategoría salvo en datos antiguos); `null` si no tiene. */
  readonly categoryId: number | null;
  /** Subcategoría; nula si el movimiento está asignado directamente a la categoría padre. */
  readonly subcategoryName: string | null;
  /** Gasto compartido con otra persona, entero o alguno de sus submovimientos. */
  readonly shared: boolean;
  /** Ingreso que devuelve gastos compartidos. */
  readonly reimbursement: boolean;
  /** Una de las dos patas de un traspaso entre cuentas propias. */
  readonly transfer: boolean;
  /** Cuota de un préstamo, p. ej. `"19/24"`. */
  readonly installment: string | null;
  /** Sus submovimientos, por orden de alta; vacío si no está dividido. */
  readonly splits: readonly SplitRow[];
  /**
   * Lo que este ingreso ya devuelve de gastos con lo que no ha dividido (ADR-0021): eso no se
   * puede dividir. 0 en los gastos.
   */
  readonly refundingCents: number;
  /** Los ingresos que devuelven este gasto, por fecha; vacío si no tiene. */
  readonly refunds: readonly RefundRow[];
  /** Es un gasto: se le pueden vincular devoluciones. */
  readonly refundable: boolean;
  /** Los movimientos vinculados con este, por fecha; vacío si no tiene. */
  readonly links: readonly TransactionLink[];
}
