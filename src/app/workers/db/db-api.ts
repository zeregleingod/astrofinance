import type { MonthReport } from '@domain/reports/month-report';
import type { TransactionRow } from '@domain/reports/transaction-row';

/** Contrato RPC del worker de base de datos. */
export interface DbApi {
  /** Abre una BD nueva en memoria con los datos de demo. Nunca se guarda. */
  openDemo: { params: undefined; result: undefined };
  close: { params: undefined; result: undefined };
  periods: { params: undefined; result: readonly string[] };
  monthReport: { params: { period: string }; result: MonthReport };
  transactions: { params: { period: string }; result: readonly TransactionRow[] };
}
