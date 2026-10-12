import type { ImportedStatement } from '@domain/imports/imported-statement';

/** Contrato RPC del worker que lee ficheros bancarios. No toca la base de datos. */
export interface ImportApi {
  /** Lee un extracto y lo deja listo para revisar. Lanza `StatementError` si no es utilizable. */
  readStatement: {
    params: { name: string; bytes: ArrayBuffer };
    result: ImportedStatement;
  };
}
