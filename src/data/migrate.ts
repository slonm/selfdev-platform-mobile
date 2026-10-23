import type { SqlDatabase } from './sql';

/** One schema step. Steps are append-only: a released step is never edited or reordered. */
export type Migration = (db: SqlDatabase) => Promise<void>;

/**
 * Brings `db` up to `steps.length`, tracked in SQLite's `user_version`: each pending step runs in
 * its own transaction together with the version bump, so a failing step leaves the database exactly
 * as it was. A database from a newer app version is refused rather than read with an older schema.
 */
export async function migrate(db: SqlDatabase, steps: readonly Migration[]): Promise<void> {
  const [row] = await db.getAllAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current > steps.length) {
    throw new Error(`the database (version ${current}) is newer than this app (version ${steps.length})`);
  }
  for (const [v, step] of steps.entries()) {
    if (v < current) continue;
    await db.execAsync('BEGIN');
    try {
      await step(db);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
      await db.execAsync('COMMIT');
    } catch (e) {
      await db.execAsync('ROLLBACK');
      throw e;
    }
  }
}
