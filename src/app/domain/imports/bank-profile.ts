import type { ProfileStatement, RawSheet } from './bank-statement';

/**
 * Formato de extracto de una entidad. Para admitir otro banco se escribe un perfil nuevo en
 * `profiles/` y se añade a `BANK_PROFILES` (`bank-profiles.ts`); nada más cambia.
 */
export interface BankProfile {
  /** Identificador estable: se guarda con cada lote y forma parte de la huella de duplicados. */
  readonly id: string;
  /** Nombre de la entidad que ve el usuario. */
  readonly institution: string;
  /** ¿Es esta hoja un extracto de este banco? Debe ser barato y no lanzar errores. */
  matches(sheet: RawSheet): boolean;
  /** Lee los movimientos. Solo se llama si `matches` ha devuelto `true`. */
  parse(sheet: RawSheet): ProfileStatement;
}
