// Ships the hand-written typing with the code, so apps compiling this source see it too.
/// <reference path="../types/js-interpreter.d.ts" />
import Interpreter from 'js-interpreter';

export type ScriptResult =
  | { ok: true; value: unknown }
  | { ok: false; error: 'timeout' | 'error'; message: string };

/** Interpreter steps a script may take; roughly a few hundred thousand simple operations. */
const DEFAULT_MAX_STEPS = 2_000_000;

/**
 * Runs untrusted user-layer code in an isolated ES5 interpreter (JS-Interpreter): the script sees
 * only the standard ES5 library — no network, modules, timers or host objects.
 *
 * The script must define `function main(input)`. `input` arrives as a JSON copy, so the script
 * cannot touch caller objects, and the result is returned through JSON as well: it must be plain
 * data. Execution is cut off after `maxSteps` interpreter steps, so an endless loop cannot hang
 * the app. Never throws; failures come back as `{ ok: false }` with a message for the author.
 */
export function runScript(source: string, input: unknown, opts: { maxSteps?: number } = {}): ScriptResult {
  let it: Interpreter;
  try {
    it = new Interpreter(`${source}\n;JSON.stringify({ r: main(JSON.parse(__input)) });`, (interp, global) => {
      interp.setProperty(global, '__input', JSON.stringify(input));
    });
  } catch (e) {
    return { ok: false, error: 'error', message: describe(e) };
  }

  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  try {
    for (let steps = 0; it.step(); steps++) {
      if (steps >= maxSteps) {
        return { ok: false, error: 'timeout', message: `stopped after ${maxSteps} steps` };
      }
    }
  } catch (e) {
    return { ok: false, error: 'error', message: describe(e) };
  }
  return { ok: true, value: (JSON.parse(it.value as string) as { r: unknown }).r };
}

function describe(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
