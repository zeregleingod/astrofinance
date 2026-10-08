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
    db.transaction(() => {
      db.run(migration.sql);
      // `version` viene del código, nunca del usuario: PRAGMA no admite parámetros.
      db.run(`PRAGMA user_version = ${migration.version}`);
    });
  }
  return { from, to: latest };
}
