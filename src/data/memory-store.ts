import type { DataRecord, DataStore } from './store';

const EMPTY: readonly DataRecord[] = Object.freeze([]);

/** In-memory `DataStore`; used in tests and as the reference behaviour for persistent stores. */
export function createMemoryStore(now: () => number = Date.now): DataStore {
  const collections = new Map<string, readonly DataRecord[]>();
  const listeners = new Set<() => void>();
  let seq = 0;

  return {
    add(collection, values) {
      const createdAt = now();
      const record: DataRecord = { id: `${createdAt}-${++seq}`, createdAt, values: { ...values } };
      collections.set(collection, [...(collections.get(collection) ?? EMPTY), record]);
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
