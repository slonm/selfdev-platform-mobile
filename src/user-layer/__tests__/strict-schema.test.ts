import { z } from 'zod';

import { userLayerSchema } from '../document';

/**
 * Every object with fixed properties in the layer format must reject unknown properties, otherwise
 * an agent's typo is silently dropped. A plain `z.object` slipped in once (a multi-line `z\n.object`
 * escaped a search-and-replace); this walks the generated JSON Schema so no spelling escapes it.
 */
function looseObjects(node: unknown, path: string, out: string[]): string[] {
  if (Array.isArray(node)) node.forEach((n, i) => looseObjects(n, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (o.type === 'object' && o.properties && o.additionalProperties !== false) out.push(path || '(root)');
    for (const [k, v] of Object.entries(o)) looseObjects(v, `${path}/${k}`, out);
  }
  return out;
}

it('rejects unknown properties on every object of the layer format', () => {
  // io: 'input' describes what the schema accepts; the default 'output' mode marks even plain
  // z.object as closed (unknown keys are stripped from output), which would hide the defect.
  expect(looseObjects(z.toJSONSchema(userLayerSchema, { io: 'input' }), '', [])).toEqual([]);
});
