import type { Migration } from './migrations/migration';
import type { SqlDb } from './sql-db';

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

/**
 * Lleva la BD a la última versión con `PRAGMA user_version` (T2.3). Cada migración va en su
 * propia transacción junto con el cambio de versión: si falla, no queda nada a medias.
 */
export function migrate(db: SqlDb, migrations: readonly Migration[]): { from: number; to: number } {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new MigrationError('Las migraciones deben ir numeradas desde 1, sin huecos.');
    }
  });

  const from = Number(db.value('PRAGMA user_version'));
  const latest = migrations.length;
  if (from > latest) {
    throw new MigrationError(
      `La base de datos es de una versión más nueva (${from}) que la que admite la app (${latest}).`,
    );
  }

  for (const migration of migrations.slice(from)) {
    if (migration.rebuildsTables) withoutForeignKeys(db, () => apply(db, migration));
    else apply(db, migration);
  }
  return { from, to: latest };
}

function apply(db: SqlDb, migration: Migration): void {
  db.transaction(() => {
    db.run(migration.sql);
    if (migration.rebuildsTables && db.rows('PRAGMA foreign_key_check').length > 0) {
      throw new MigrationError(`La migración «${migration.name}» deja claves ajenas rotas.`);
    }
    // `version` viene del código, nunca del usuario: PRAGMA no admite parámetros.
    db.run(`PRAGMA user_version = ${migration.version}`);
  });
}

/**
 * Borrar una tabla referenciada falla con las claves ajenas activas, y el PRAGMA no tiene
 * efecto dentro de una transacción: se cambia fuera y se deja como estaba.
 */
function withoutForeignKeys(db: SqlDb, fn: () => void): void {
  const enabled = Number(db.value('PRAGMA foreign_keys')) === 1;
  db.run('PRAGMA foreign_keys = OFF');
  try {
    fn();
  } finally {
    if (enabled) db.run('PRAGMA foreign_keys = ON');
  }
}
