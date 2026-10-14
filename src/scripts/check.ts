import type { UserLayer, ValidationError } from '../user-layer/document';
import { runScript } from './sandbox';

/**
 * Runs every script test of the layer in the sandbox. A version whose tests fail must not
 * activate; errors point at the failing test and say what the script produced instead.
 */
export function checkScripts(layer: Pick<UserLayer, 'scripts'>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [name, script] of Object.entries(layer.scripts ?? {})) {
    script.tests.forEach((test, i) => {
      const path = ['scripts', name, 'tests', i];
      const r = runScript(script.source, test.input);
      if (!r.ok) {
        errors.push({ path, message: `test "${test.name}" ${r.error}: ${r.message}` });
      } else if (canonical(r.value) !== canonical(test.expect)) {
        errors.push({ path, message: `test "${test.name}" expected ${canonical(test.expect)}, got ${canonical(r.value)}` });
      }
    });
  }
  return errors;
}

/** JSON with object keys sorted, so equal data compares equal regardless of key order. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}
