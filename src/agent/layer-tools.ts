import { z } from 'zod';

import type { DataStore } from '../data/store';
import { checkScripts } from '../scripts/check';
import { userLayerSchema, validateLayer, type UserLayer } from '../user-layer/document';
import { propose, rendered, type History } from '../user-layer/history';
import type { AgentTool } from './loop';

/** The user-layer format as JSON Schema, without the top-level `$schema` marker. */
function layerJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(userLayerSchema) as Record<string, unknown>;
  return schema;
}

/**
 * Tools through which the agent works on the user layer. The agent can read the layer, propose a
 * new version and see how much data exists; it cannot accept a version (the user does) and cannot
 * read record values.
 */
export function createLayerTools(ctx: {
  getHistory: () => History<UserLayer>;
  setHistory: (h: History<UserLayer>) => void;
  store: DataStore;
}): AgentTool[] {
  return [
    {
      name: 'read_layer',
      description: 'Returns the user layer currently shown to the user (including a pending preview) as JSON.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        return { content: JSON.stringify(rendered(ctx.getHistory())) };
      },
    },
    {
      name: 'propose_layer',
      description:
        'Proposes a complete new version of the user layer. It is validated first and every script ' +
        'test is run: on failure you get the errors with JSON paths and nothing changes. On success the user sees it as a preview and ' +
        'decides to accept or discard it; you cannot accept it yourself.',
      inputSchema: { type: 'object', properties: { layer: layerJsonSchema() }, required: ['layer'] },
      async run(input) {
        const layer = (input as { layer?: unknown } | null)?.layer;
        if (layer === undefined) return { content: 'missing "layer"', isError: true };
        const result = validateLayer(layer);
        if (!result.ok) return { content: JSON.stringify({ errors: result.errors }), isError: true };
        const scriptErrors = checkScripts(result.layer);
        if (scriptErrors.length) return { content: JSON.stringify({ errors: scriptErrors }), isError: true };
        ctx.setHistory(propose(ctx.getHistory(), result.layer));
        return { content: 'The proposal is now shown to the user as a preview.' };
      },
    },
    {
      name: 'describe_data',
      description:
        'For each collection of the current layer: how many records exist and when the last was saved. ' +
        'Record values are private and not available.',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        const layer = rendered(ctx.getHistory());
        const summary = Object.fromEntries(
          Object.keys(layer.collections).map((name) => {
            const records = ctx.store.list(name);
            const last = records.at(-1);
            return [name, { records: records.length, last: last ? new Date(last.createdAt).toISOString() : null }];
          })
        );
        return { content: JSON.stringify(summary) };
      },
    },
  ];
}
