import { z } from 'zod';

import { validateLayer, type UserLayer } from './document';
import { createHistory, type History } from './history';

const id = z.number().int().nonnegative();
const historyShape = z.object({
  versions: z.array(z.unknown()).min(1),
  accepted: z.array(id).min(1),
  preview: id.nullable(),
  lastGood: id.nullable(),
  unfinishedLaunches: z.number().int().nonnegative(),
  safeMode: z.boolean(),
});

/**
 * Turns a persisted history back into one the app can render. Storage can hold anything: a
 * corrupted write, or versions that were valid for an earlier release of the app (for example,
 * naming an action it no longer has). Rules, mildest first:
 * - an invalid preview is dropped;
 * - accepted versions that are invalid now are stepped back over, newest first;
 * - if no accepted version is valid, the default layer is accepted as a new version, keeping the
 *   history for reference;
 * - a structurally broken history, or none, starts over from the default layer.
 */
export function restoreHistory(
  raw: unknown,
  defaultLayer: UserLayer,
  opts: { actions?: readonly string[] } = {}
): History<UserLayer> {
  const shape = historyShape.safeParse(raw);
  if (!shape.success) return createHistory(defaultLayer);
  const h = shape.data;
  const inRange = (v: number | null) => v === null || v < h.versions.length;
  if (!h.accepted.every(inRange) || !inRange(h.preview) || !inRange(h.lastGood)) return createHistory(defaultLayer);

  const valid = h.versions.map((v) => validateLayer(v, opts).ok);
  const versions = h.versions as UserLayer[];
  const isValid = (v: number | null): v is number => v !== null && valid[v] === true;
  const accepted = [...h.accepted];
  while (accepted.length > 0 && !isValid(accepted.at(-1) ?? null)) accepted.pop();

  const base = {
    versions,
    preview: isValid(h.preview) ? h.preview : null,
    lastGood: isValid(h.lastGood) ? h.lastGood : null,
    unfinishedLaunches: h.unfinishedLaunches,
    safeMode: h.safeMode && isValid(h.lastGood),
  };
  if (accepted.length > 0) return { ...base, accepted };
  return { ...base, versions: [...versions, defaultLayer], accepted: [versions.length], preview: null };
}
