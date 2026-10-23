import { isPeriod } from '../dates/period';

/** Los totales de arriba del resumen mensual, en el orden en que se muestran. */
export const SUMMARY_TOTALS = ['ingresos', 'gastos', 'ahorro', 'balance', 'pendiente'] as const;

export type SummaryTotal = (typeof SUMMARY_TOTALS)[number];

/** Un total del resumen de un mes: la lista de movimientos enseña los que lo forman. */
export interface SummaryOrigin {
  readonly period: string;
  readonly total: SummaryTotal;
}

export function isSummaryTotal(value: unknown): value is SummaryTotal {
  return (SUMMARY_TOTALS as readonly unknown[]).includes(value);
}

/** El origen pedido en la URL (`?mes=AAAA-MM&origen=gastos`); `null` si falta o no es válido. */
export function summaryOrigin(
  period: string | undefined,
  total: string | undefined,
): SummaryOrigin | null {
  return isPeriod(period) && isSummaryTotal(total) ? { period, total } : null;
}
