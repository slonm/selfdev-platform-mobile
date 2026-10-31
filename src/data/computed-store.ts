import { runScript } from '../scripts/sandbox';
import type { UserLayer } from '../user-layer/document';
import type { DataRecord, DataStore, FieldValue } from './store';

const EMPTY: readonly DataRecord[] = Object.freeze([]);

/**
 * Wraps a store so the layer's computed collections can be read like stored ones. A computed
 * collection is produced by its script from all stored collections and recomputed only when one of
 * them changes (list snapshots are compared by identity). Output that is not a list of
 * `{ createdAt, values }` matching the declared fields is discarded: the collection reads as empty
 * and `onError` names it, so a broken script degrades one chart instead of the app.
 */
export function withComputed(
  base: DataStore,
  layer: UserLayer,
  opts: { onError?: (collection: string, message: string) => void } = {}
): DataStore {
  const stored = Object.entries(layer.collections)
    .filter(([, c]) => c.compute === undefined)
    .map(([n]) => n);
  const cache = new Map<string, { inputs: readonly (readonly DataRecord[])[]; result: readonly DataRecord[] }>();
  /** The collection's definition and script when it is computed; undefined for stored or unknown names. */
  const computed = (name: string) => {
    const def = Object.hasOwn(layer.collections, name) ? layer.collections[name] : undefined;
    const script = def?.compute !== undefined ? layer.scripts?.[def.compute] : undefined;
    return def && script ? { def, script } : undefined;
  };

  return {
    add(collection, values, createdAt) {
      if (computed(collection)) throw new Error(`"${collection}" is computed and read-only`);
      return base.add(collection, values, createdAt);
    },
    update(collection, id, values) {
      if (computed(collection)) throw new Error(`"${collection}" is computed and read-only`);
      return base.update(collection, id, values);
    },
    remove(collection, id) {
      if (computed(collection)) throw new Error(`"${collection}" is computed and read-only`);
      base.remove(collection, id);
    },
    list(collection) {
      const c = computed(collection);
      if (!c) return base.list(collection);
      const inputs = stored.map((n) => base.list(n));
      const hit = cache.get(collection);
      if (hit && hit.inputs.every((list, i) => list === inputs[i])) return hit.result;

      const input = {
        collections: Object.fromEntries(
          stored.map((n, i) => [n, (inputs[i] ?? []).map(({ createdAt, values }) => ({ createdAt, values }))])
        ),
      };
      const run = runScript(c.script.source, input);
      const checked = run.ok ? toRecords(collection, run.value, c.def.fields) : run.message;
      let result: readonly DataRecord[] = EMPTY;
      if (typeof checked === 'string') opts.onError?.(collection, checked);
      else result = checked;
      cache.set(collection, { inputs, result });
      return result;
    },
    subscribe: base.subscribe,
  };
}

function toRecords(
  collection: string,
  output: unknown,
  fields: UserLayer['collections'][string]['fields']
): readonly DataRecord[] | string {
  if (!Array.isArray(output)) return 'script did not return a list';
  const records: DataRecord[] = [];
  for (const [i, item] of output.entries()) {
    const { createdAt, values } = (item ?? {}) as { createdAt?: unknown; values?: unknown };
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return `item ${i}: createdAt must be a number`;
    if (!values || typeof values !== 'object') return `item ${i}: values must be an object`;
    for (const [field, v] of Object.entries(values)) {
      const type = Object.hasOwn(fields, field) ? fields[field]?.type : undefined;
      if (!type) return `item ${i}: undeclared field "${field}"`;
      if (type === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== 'string') {
        return `item ${i}: "${field}" must be ${type}`;
      }
    }
    records.push({ id: `${collection}-${i}`, createdAt, values: values as Record<string, FieldValue> });
  }
  return records;
}
