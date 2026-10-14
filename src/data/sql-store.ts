import { createMemoryStore } from './memory-store';
import type { SqlDatabase } from './sql';
import type { DataRecord, DataStore } from './store';

/** A `DataStore` persisted in SQLite. `flush` resolves once every add so far has been written. */
export type SqlStore = DataStore & { flush(): Promise<void> };

type Row = { id: string; collection: string; created_at: number; values_json: string };

/**
 * Opens the record store on `db`, creating its table on first use, and loads all records into
 * memory. Reads are served from memory; each add is written in the background, in order. A failed
 * write is passed to `onError` (default: `console.error`) — the record stays visible until restart.
 */
export async function openSqlStore(
  db: SqlDatabase,
  opts: { now?: () => number; onError?: (e: unknown) => void } = {}
): Promise<SqlStore> {
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS records (
       id TEXT PRIMARY KEY, collection TEXT NOT NULL, created_at INTEGER NOT NULL, values_json TEXT NOT NULL);`
  );
  const rows = await db.getAllAsync<Row>('SELECT id, collection, created_at, values_json FROM records ORDER BY rowid');
  const onError = opts.onError ?? ((e: unknown) => console.error('record write failed', e));
  let pending: Promise<void> = Promise.resolve();

  const store = createMemoryStore(opts.now, {
    initial: rows.map((r) => ({
      collection: r.collection,
      record: { id: r.id, createdAt: r.created_at, values: JSON.parse(r.values_json) } satisfies DataRecord,
    })),
    onAdd(collection, record) {
      pending = pending.then(() =>
        db
          .runAsync('INSERT INTO records (id, collection, created_at, values_json) VALUES (?, ?, ?, ?)', [
            record.id,
            collection,
            record.createdAt,
            JSON.stringify(record.values),
          ])
          .then(() => undefined, onError)
      );
    },
  });
  return { ...store, flush: () => pending };
}

/** Small JSON key-value table, e.g. for the user-layer history. */
export type KeyValue = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

export async function openKeyValue(db: SqlDatabase): Promise<KeyValue> {
  await db.execAsync('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  return {
    async get(key) {
      const [row] = await db.getAllAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
      return row ? JSON.parse(row.value) : null;
    },
    async set(key, value) {
      await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    },
  };
}
