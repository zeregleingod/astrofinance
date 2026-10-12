import type { BankProfile } from './bank-profile';
import { StatementError, type BankStatement, type RawSheet } from './bank-statement';
import { sabadellProfile } from './profiles/sabadell';

/** Entidades admitidas. El orden importa: gana el primer perfil que reconoce la hoja. */
export const BANK_PROFILES: readonly BankProfile[] = [sabadellProfile];

/** Lee un extracto con el perfil que lo reconozca. Lanza `StatementError` si no es utilizable. */
export function parseStatement(
  sheet: RawSheet,
  profiles: readonly BankProfile[] = BANK_PROFILES,
): BankStatement {
  if (sheet.length === 0) throw new StatementError('fichero-vacio');
  const profile = profiles.find((candidate) => candidate.matches(sheet));
  if (!profile) throw new StatementError('formato-desconocido');

  const { ibanLast4, declaredFrom, declaredTo, movements, errors } = profile.parse(sheet);
  const dates = movements.map((movement) => movement.opDate).sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) throw new StatementError('sin-movimientos');

  return {
    profileId: profile.id,
    institution: profile.institution,
    ibanLast4,
    // El periodo declarado manda, salvo que algún movimiento quede fuera de él.
    dateFrom: declaredFrom !== null && declaredFrom <= first ? declaredFrom : first,
    dateTo: declaredTo !== null && declaredTo >= last ? declaredTo : last,
    movements,
    errors,
  };
}
