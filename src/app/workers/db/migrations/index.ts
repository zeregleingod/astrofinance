import { migration001 } from './001-esquema-inicial';
import { migration002 } from './002-concepto-original';
import { migration003 } from './003-categorias-padre-sin-tipo';
import { migration004 } from './004-reglas-coincidencia-exacta';
import { migration005 } from './005-reembolsos-a-subcategorias';
import { migration006 } from './006-categoria-sugerida';
import { migration007 } from './007-submovimientos';
import type { Migration } from './migration';

/** Migraciones en orden de versión. Nunca se edita una ya publicada: se añade otra. */
export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
];
