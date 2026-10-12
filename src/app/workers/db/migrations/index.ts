import { migration001 } from './001-esquema-inicial';
import { migration002 } from './002-concepto-original';
import { migration003 } from './003-categorias-padre-sin-tipo';
import type { Migration } from './migration';

/** Migraciones en orden de versión. Nunca se edita una ya publicada: se añade otra. */
export const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003];
