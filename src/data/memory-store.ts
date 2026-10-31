import type { DataRecord, DataStore } from './store';

const EMPTY: readonly DataRecord[] = Object.freeze([]);

export type MemoryStoreOptions = {
  /** Records to start with, in insertion order. */
  initial?: Iterable<{ collection: string; record: DataRecord }>;
  /** Called after each add; persistent stores write through from here. */
  onAdd?: (collection: string, record: DataRecord) => void;
  /** Called after a record's values were replaced. */
  onUpdate?: (collection: string, record: DataRecord) => void;
  /** Called after a record was deleted. */
  onRemove?: (collection: string, id: string) => void;
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
  // Array.prototype.sort is stable, so equal times keep their insertion order.
  for (const [collection, list] of grouped) collections.set(collection, list.sort((a, b) => a.createdAt - b.createdAt));

  return {
    add(collection, values, at) {
      const createdAt = at ?? now();
      // Unique across restarts without a crypto API (Hermes has no randomUUID).
      const id = `${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const record: DataRecord = { id, createdAt, values: { ...values } };
      const list = collections.get(collection) ?? EMPTY;
      // After every record at the same time or earlier, so the list stays in time order.
      let i = list.length;
      while (i > 0 && (list[i - 1]?.createdAt ?? -Infinity) > createdAt) i--;
      collections.set(collection, [...list.slice(0, i), record, ...list.slice(i)]);
      options.onAdd?.(collection, record);
      listeners.forEach((l) => l());
      return record;
    },
    update(collection, id, values) {
      const list = collections.get(collection) ?? EMPTY;
      const old = list.find((r) => r.id === id);
      if (!old) throw new Error(`no record ${id} in "${collection}"`);
      const record: DataRecord = { ...old, values: { ...values } };
      collections.set(collection, list.map((r) => (r.id === id ? record : r)));
      options.onUpdate?.(collection, record);
      listeners.forEach((l) => l());
      return record;
    },
    remove(collection, id) {
      const list = collections.get(collection) ?? EMPTY;
      if (!list.some((r) => r.id === id)) throw new Error(`no record ${id} in "${collection}"`);
      collections.set(collection, list.filter((r) => r.id !== id));
      options.onRemove?.(collection, id);
      listeners.forEach((l) => l());
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
