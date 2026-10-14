import { z } from 'zod';

/**
 * The user layer document: data collections, screens composed from the component kit, and the tab
 * bar. It is what the on-device agent edits and what the renderer draws, so it is validated before
 * it can become a version (see `history.ts`): an invalid document never reaches the renderer.
 *
 * Validation has two passes: structure (this schema) and references between parts (screens,
 * collections, fields), which a schema cannot express.
 */

const fieldSchema = z.strictObject({ type: z.enum(['number', 'text']) });

const collectionSchema = z.strictObject({
  /** Field name → definition. Records also carry an implicit creation timestamp. */
  fields: z.record(z.string(), fieldSchema),
  /**
   * Name of a script that derives this collection from the stored ones; such a collection is
   * read-only. The script's `main({ collections })` receives every stored collection as
   * `[{ createdAt, values }]` and returns records of the same shape.
   */
  compute: z.string().optional(),
});

const scriptSchema = z.strictObject({
  /** ES5 source defining `function main(input)`; runs in the sandbox (`src/scripts/sandbox.ts`). */
  source: z.string(),
  /** Examples `main(input)` must reproduce exactly; at least one, run before a version activates. */
  tests: z.array(z.strictObject({ name: z.string(), input: z.unknown(), expect: z.unknown() })).min(1),
});

const scaleSchema = z
  .object({
    type: z.literal('scale'),
    field: z.string(),
    label: z.string(),
    min: z.number().int(),
    max: z.number().int(),
    minLabel: z.string().optional(),
    maxLabel: z.string().optional(),
  })
  .refine((s) => s.min < s.max, { path: ['max'], message: 'max must be greater than min' });

const textInputSchema = z.strictObject({
  type: z.literal('textInput'),
  field: z.string(),
  label: z.string(),
  multiline: z.boolean().optional(),
});

const inputSchema = z.discriminatedUnion('type', [scaleSchema, textInputSchema]);

const nodeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), value: z.string() }),
  z.strictObject({
    type: z.literal('form'),
    /** Each submit adds one record to this collection. */
    collection: z.string(),
    submitLabel: z.string(),
    fields: z.array(inputSchema).min(1),
  }),
  z.strictObject({ type: z.literal('list'), collection: z.string(), fields: z.array(z.string()).min(1) }),
  z.strictObject({
    type: z.literal('chart'),
    collection: z.string(),
    /** Number fields plotted against record time. */
    series: z.array(z.string()).min(1),
  }),
  z.strictObject({ type: z.literal('button'), label: z.string(), navigate: z.string() }),
]);

const screenSchema = z.strictObject({ title: z.string(), body: z.array(nodeSchema) });

const reminderSchema = z.strictObject({
  /** Unique within the layer. */
  id: z.string(),
  /** Local time of day, 24-hour `HH:MM`. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM, 00:00-23:59'),
  title: z.string(),
  body: z.string().optional(),
});

export const userLayerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  collections: z.record(z.string(), collectionSchema),
  screens: z.record(z.string(), screenSchema),
  tabs: z.array(z.strictObject({ screen: z.string(), title: z.string() })).min(1),
  /** Daily notifications; the platform keeps the OS schedule equal to this list. */
  reminders: z.array(reminderSchema).optional(),
  /** Named scripts, used by computed collections. */
  scripts: z.record(z.string(), scriptSchema).optional(),
});

export type Reminder = z.infer<typeof reminderSchema>;

export type UserLayer = z.infer<typeof userLayerSchema>;

export type ValidationError = { path: (string | number)[]; message: string };
export type ValidationResult = { ok: true; layer: UserLayer } | { ok: false; errors: ValidationError[] };

/** Checks a candidate user layer; errors carry the JSON path of the offending value. */
export function validateLayer(input: unknown): ValidationResult {
  const parsed = userLayerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.flatMap((i) => {
        const path = i.path.filter((p): p is string | number => typeof p !== 'symbol');
        // One error per unknown property, pointing at it, so a typo is located exactly.
        return i.code === 'unrecognized_keys'
          ? i.keys.map((k) => ({ path: [...path, k], message: `unknown property "${k}"` }))
          : [{ path, message: i.message }];
      }),
    };
  }
  const errors = checkReferences(parsed.data);
  return errors.length ? { ok: false, errors } : { ok: true, layer: parsed.data };
}

function checkReferences(layer: UserLayer): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (path: (string | number)[], message: string) => errors.push({ path, message });
  const hasScreen = (id: string) => Object.hasOwn(layer.screens, id);
  const fieldType = (collection: string, field: string) =>
    Object.hasOwn(layer.collections[collection].fields, field)
      ? layer.collections[collection].fields[field].type
      : undefined;

  layer.tabs.forEach((tab, i) => {
    if (!hasScreen(tab.screen)) fail(['tabs', i, 'screen'], `no screen "${tab.screen}"`);
  });

  const reminderIds = new Set<string>();
  layer.reminders?.forEach((r, i) => {
    if (reminderIds.has(r.id)) fail(['reminders', i, 'id'], `duplicate reminder id "${r.id}"`);
    reminderIds.add(r.id);
  });

  for (const [name, c] of Object.entries(layer.collections)) {
    if (c.compute !== undefined && !Object.hasOwn(layer.scripts ?? {}, c.compute)) {
      fail(['collections', name, 'compute'], `no script "${c.compute}"`);
    }
  }

  for (const [screenId, screen] of Object.entries(layer.screens)) {
    screen.body.forEach((node, n) => {
      const at = ['screens', screenId, 'body', n];
      if (node.type === 'button') {
        if (!hasScreen(node.navigate)) fail([...at, 'navigate'], `no screen "${node.navigate}"`);
        return;
      }
      if (node.type === 'text') return;
      if (!Object.hasOwn(layer.collections, node.collection)) {
        fail([...at, 'collection'], `no collection "${node.collection}"`);
        return;
      }
      if (node.type === 'form' && layer.collections[node.collection].compute !== undefined) {
        fail([...at, 'collection'], `"${node.collection}" is computed and cannot be written`);
        return;
      }
      if (node.type === 'form') {
        node.fields.forEach((input, f) => {
          const want = input.type === 'scale' ? 'number' : 'text';
          const got = fieldType(node.collection, input.field);
          if (got !== want) {
            fail(
              [...at, 'fields', f, 'field'],
              got ? `"${input.field}" is ${got}, ${input.type} needs ${want}` : `no field "${input.field}"`
            );
          }
        });
      } else if (node.type === 'chart') {
        node.series.forEach((field, s) => {
          if (fieldType(node.collection, field) !== 'number') {
            fail([...at, 'series', s], `"${field}" is not a number field of "${node.collection}"`);
          }
        });
      } else {
        node.fields.forEach((field, f) => {
          if (!fieldType(node.collection, field)) fail([...at, 'fields', f], `no field "${field}"`);
        });
      }
    });
  }
  return errors;
}
