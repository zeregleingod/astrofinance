/** Movimiento listo para mostrarse en la lista mensual. */
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
  readonly note: string | null;
  readonly amountCents: number;
  readonly accountName: string;
  /** Categoría padre (el bloque de la hoja mensual). */
  readonly categoryName: string | null;
  /** Subcategoría; nula si el movimiento está asignado directamente a la categoría padre. */
  readonly subcategoryName: string | null;
  /** Gasto compartido con otra persona. */
  readonly shared: boolean;
  /** Ingreso que devuelve gastos compartidos. */
  readonly reimbursement: boolean;
  /** Una de las dos patas de un traspaso entre cuentas propias. */
  readonly transfer: boolean;
  /** Cuota de un préstamo, p. ej. `"19/24"`. */
  readonly installment: string | null;
}
