/** A value of a record field: numbers for `number` fields, strings for `text` fields. */
export type FieldValue = number | string;

/** One saved entry of a user-layer collection. */
export type DataRecord = {
  id: string;
  /** Creation time, epoch ms; charts plot against it. */
  createdAt: number;
  values: Record<string, FieldValue>;
};

/**
 * Where user-layer data lives. The renderer and the agent reach data only through this interface,
 * so storage (memory in tests, SQLite on the device) is swappable.
 *
 * `list` must return the same array object until that collection changes, so React can subscribe
 * with `useSyncExternalStore` without re-rendering on every read.
 */
export interface DataStore {
  /** Stamps the record with `createdAt` when given (data imported after the fact), else the clock. */
  add(collection: string, values: Record<string, FieldValue>, createdAt?: number): DataRecord;
  /** Records of one collection in time order (`createdAt`; equal times in the order added). */
  list(collection: string): readonly DataRecord[];
  /** Calls `listener` after any change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
