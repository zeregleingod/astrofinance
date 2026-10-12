/** Paso de esquema. El ejecutor (T2.3) la aplica en una transacción y fija `user_version`. */
export interface Migration {
  /** Valor de `PRAGMA user_version` tras aplicarla. */
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  /**
   * Reconstruye alguna tabla (crear otra, copiar, borrar y renombrar). El ejecutor desactiva
   * las claves ajenas mientras dura y comprueba que ninguna queda rota antes de confirmar.
   */
  readonly rebuildsTables?: boolean;
}
