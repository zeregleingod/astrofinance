/**
 * `ahorro`: dinero que se aparta (traspasos a una cuenta de ahorro); no es ingreso ni gasto.
 * Hasta la migración 003 se llamaba `neutra`.
 */
export type CategoryKind = 'ingreso' | 'gasto' | 'ahorro';
