import { BANK_PROFILES } from '../imports/bank-profiles';

/**
 * Cuentas del usuario (ADR-0034): cada una es de un banco y tiene un nombre. La importación da de
 * alta sola la cuenta de un extracto nuevo; en Configuración › Cuentas se crean, se renombran y
 * se eliminan a mano.
 */

/** Como en el esquema: `accounts.name` y `accounts.institution`. */
export const ACCOUNT_NAME_MAX = 80;
export const INSTITUTION_MAX = 80;

/**
 * Los bancos que se ofrecen al crear una cuenta: los que se saben importar, por orden
 * alfabético, para que sus movimientos se puedan enlazar con ella.
 */
export const ACCOUNT_BANKS: readonly string[] = [
  ...new Set(BANK_PROFILES.map((profile) => profile.institution)),
].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

/** Una cuenta tal como se lista. */
export interface AccountRow {
  readonly id: number;
  readonly name: string;
  /** El banco; `null` en una cuenta antigua sin él. */
  readonly institution: string | null;
  /** Los cuatro últimos dígitos del IBAN, si los dio un extracto. */
  readonly ibanLast4: string | null;
  readonly transactionCount: number;
}

export interface NewAccount {
  readonly name: string;
  readonly institution: string;
}

export interface AccountUpdate extends NewAccount {
  readonly id: number;
}

export const ACCOUNT_ERROR_CODES = [
  'nombre-vacio',
  'nombre-largo',
  'nombre-repetido',
  'banco-vacio',
  'banco-largo',
  'banco-con-movimientos',
  'cuenta-con-movimientos',
  'cuenta-inexistente',
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

/** Error que impide guardar o eliminar una cuenta; `message` es el código, como en `RuleError`. */
export class AccountError extends Error {
  override readonly name = 'AccountError';

  constructor(readonly code: AccountErrorCode) {
    super(code);
  }
}

/** El código de un `AccountError`, también si ha cruzado entre hilos; si no, `null`. */
export function accountErrorCode(error: unknown): AccountErrorCode | null {
  if (!(error instanceof Error) || error.name !== 'AccountError') return null;
  return ACCOUNT_ERROR_CODES.find((code) => code === error.message) ?? null;
}

/** Un nombre o un banco tal como se guarda: sin espacios en los extremos ni repetidos. */
export function cleanAccountText(text: string): string {
  return text.trim().replace(/\s+/gu, ' ');
}

/** La cuenta tal como se guarda. */
export function cleanAccount<T extends NewAccount>(account: T): T {
  return {
    ...account,
    name: cleanAccountText(account.name),
    institution: cleanAccountText(account.institution),
  };
}

/**
 * Por qué no vale una cuenta, o `null` si vale. Dos cuentas no pueden llamarse igual, sin
 * distinguir mayúsculas ni acentos: en los movimientos solo se ve el nombre.
 */
export function accountError(
  account: NewAccount,
  others: readonly Pick<AccountRow, 'name'>[] = [],
): AccountErrorCode | null {
  const { name, institution } = cleanAccount(account);
  if (name === '') return 'nombre-vacio';
  if (name.length > ACCOUNT_NAME_MAX) return 'nombre-largo';
  const key = foldName(name);
  if (others.some((other) => foldName(other.name) === key)) return 'nombre-repetido';
  if (institution === '') return 'banco-vacio';
  if (institution.length > INSTITUTION_MAX) return 'banco-largo';
  return null;
}

/** Para comparar nombres: sin mayúsculas, acentos ni espacios repetidos. */
function foldName(name: string): string {
  return cleanAccountText(name).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}
