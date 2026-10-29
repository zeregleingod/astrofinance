import type { BankProfile } from './bank-profile';
import { StatementError, type BankStatement, type RawSheet } from './bank-statement';
import { bankinterProfile } from './profiles/bankinter';
import { bbvaProfile } from './profiles/bbva';
import { caixabankProfile } from './profiles/caixabank';
import { ingProfile } from './profiles/ing';
import { n26Profile } from './profiles/n26';
import { revolutProfile } from './profiles/revolut';
import { sabadellProfile } from './profiles/sabadell';
import { santanderProfile } from './profiles/santander';

/**
 * Entidades admitidas. Gana el primer perfil que reconoce la hoja, pero las firmas de columnas
 * de cada perfil no se solapan (lo comprueba un test), así que el orden no debería decidir nada.
 */
export const BANK_PROFILES: readonly BankProfile[] = [
  sabadellProfile,
  bbvaProfile,
  bankinterProfile,
  caixabankProfile,
  ingProfile,
  n26Profile,
  revolutProfile,
  santanderProfile,
];

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
