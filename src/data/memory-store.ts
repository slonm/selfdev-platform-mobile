import type { DataRecord, DataStore } from './store';

const EMPTY: readonly DataRecord[] = Object.freeze([]);

export type MemoryStoreOptions = {
  /** Records to start with, in insertion order. */
  initial?: Iterable<{ collection: string; record: DataRecord }>;
  /** Called after each add; persistent stores write through from here. */
  onAdd?: (collection: string, record: DataRecord) => void;
};

/** In-memory `DataStore`; used in tests, and as the cache behind persistent stores. */
export function createMemoryStore(now: () => number = Date.now, options: MemoryStoreOptions = {}): DataStore {
  const collections = new Map<string, readonly DataRecord[]>();
  const listeners = new Set<() => void>();
  const grouped = new Map<string, DataRecord[]>();
  for (const { collection, record } of options.initial ?? []) {
    const list = grouped.get(collection);
    if (list) list.push(record);
    else grouped.set(collection, [record]);
  }
  for (const [collection, list] of grouped) collections.set(collection, list);

  return {
    add(collection, values) {
      const createdAt = now();
      // Unique across restarts without a crypto API (Hermes has no randomUUID).
      const id = `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const record: DataRecord = { id, createdAt, values: { ...values } };
      collections.set(collection, [...(collections.get(collection) ?? EMPTY), record]);
      options.onAdd?.(collection, record);
      listeners.forEach((l) => l());
      return record;
    },
    list(collection) {
      return collections.get(collection) ?? EMPTY;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
