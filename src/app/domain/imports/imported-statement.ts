import { sha256HexOfText } from '../crypto/sha256';
import type { BankStatement, StatementMovement } from './bank-statement';

export interface ImportedMovement extends StatementMovement {
  /** Huella para no guardar dos veces el mismo movimiento al reimportar. */
  readonly dedupeHash: string;
}

/** Extracto leído y listo para revisar: nada de esto se ha guardado todavía. */
export interface ImportedStatement extends Omit<BankStatement, 'movements'> {
  readonly fileName: string;
  readonly fileSha256: string;
  readonly movements: readonly ImportedMovement[];
  /** Filas cuyo saldo no es el anterior más su importe: fila mal leída o movimiento ausente. */
  readonly balanceMismatchRows: readonly number[];
  /** Saldo de la cuenta antes del primer movimiento del extracto, si el banco da saldos. */
  readonly openingBalanceCents: number | null;
}

export function prepareImport(
  statement: BankStatement,
  file: { readonly name: string; readonly sha256: string },
): ImportedStatement {
  return {
    ...statement,
    fileName: file.name,
    fileSha256: file.sha256,
    movements: withDedupeHashes(statement),
    ...checkBalances(statement.movements),
  };
}

/**
 * Huella determinista de cada movimiento sobre los datos **originales** del banco (entidad,
 * cuenta, fecha, importe, concepto y saldo posterior) más un contador de repetición dentro del
 * fichero: dos cargos idénticos legítimos no colapsan, y lo que el usuario edite en la revisión
 * no cambia la huella.
 */
export function withDedupeHashes(
  statement: Pick<BankStatement, 'profileId' | 'ibanLast4' | 'movements'>,
): ImportedMovement[] {
  const seen = new Map<string, number>();
  return statement.movements.map((movement) => {
    const base = JSON.stringify([
      statement.profileId,
      statement.ibanLast4,
      movement.opDate,
      movement.amountCents,
      movement.description,
      movement.balanceAfterCents,
    ]);
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { ...movement, dedupeHash: sha256HexOfText(`${base}#${repeat}`) };
  });
}

/** Comprueba la cadena de saldos en orden cronológico, venga el fichero como venga ordenado. */
export function checkBalances(
  movements: readonly StatementMovement[],
): Pick<ImportedStatement, 'balanceMismatchRows' | 'openingBalanceCents'> {
  const reversed = [...movements].reverse();
  const descending = (movements[0]?.opDate ?? '') >= (movements.at(-1)?.opDate ?? '');
  const preferred = chain(descending ? reversed : movements);
  const other = chain(descending ? movements : reversed);
  return other.balanceMismatchRows.length < preferred.balanceMismatchRows.length
    ? other
    : preferred;
}

function chain(
  chronological: readonly StatementMovement[],
): Pick<ImportedStatement, 'balanceMismatchRows' | 'openingBalanceCents'> {
  const balanceMismatchRows: number[] = [];
  let previous: number | null = null;
  for (const movement of chronological) {
    const balance = movement.balanceAfterCents;
    if (previous !== null && balance !== null && previous + movement.amountCents !== balance) {
      balanceMismatchRows.push(movement.row);
    }
    previous = balance;
  }
  const first = chronological[0];
  return {
    balanceMismatchRows,
    openingBalanceCents:
      first === undefined || first.balanceAfterCents === null
        ? null
        : first.balanceAfterCents - first.amountCents,
  };
}

/** El mes `AAAA-MM` del extracto si todo él cae en un único mes; si no, `null`. */
export function statementPeriod(
  statement: Pick<BankStatement, 'dateFrom' | 'dateTo'>,
): string | null {
  const period = statement.dateFrom.slice(0, 7);
  return statement.dateTo.slice(0, 7) === period ? period : null;
}
