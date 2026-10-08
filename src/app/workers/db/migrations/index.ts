import { migration001 } from './001-esquema-inicial';
import type { Migration } from './migration';

/** Migraciones en orden de versión. Nunca se edita una ya publicada: se añade otra. */
export const MIGRATIONS: readonly Migration[] = [migration001];
