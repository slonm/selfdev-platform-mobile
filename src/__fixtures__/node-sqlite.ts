import type { SqlDatabase } from '../data/sql';

/**
 * A real SQLite database (Node's built-in `node:sqlite`, in memory) behind the subset of the
 * expo-sqlite API the platform uses, so storage tests run actual SQL. Test-only: never imported by
 * the package entry point.
 */
export function nodeSqlite(): SqlDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, params = []) {
      db.prepare(source).run(...params);
    },
    async getAllAsync<T>(source: string, params: (string | number | null)[] = []) {
      return db.prepare(source).all(...params) as T[];
    },
  };
}
