import { canonical } from '../scripts/check';
import type { UserLayer } from './document';
import { accept, propose, type History } from './history';

/**
 * Brings an app's new default layer (shipped by an app update) to a device that already has a
 * history, which otherwise would keep showing the layer it started with:
 * - the default did not change, the active layer already equals it, or (previous default unknown)
 *   the history already holds it: nothing to do;
 * - the user never changed the layer (the active version is the previous default, or the previous
 *   default is unknown and there is only one version): accept the new default as a new version,
 *   so undo still leads back;
 * - the user did change it: offer the new default as a preview and let them decide.
 */
export function adoptDefaultLayer(
  h: History<UserLayer>,
  newDefault: UserLayer,
  previousDefault: UserLayer | null
): History<UserLayer> {
  const target = canonical(newDefault);
  if (previousDefault !== null && canonical(previousDefault) === target) return h;
  const active = h.versions[h.accepted.at(-1) ?? 0];
  if (active !== undefined && canonical(active) === target) return h;
  // Without a record of the previous default, a default already in the history is not news.
  if (previousDefault === null && h.versions.some((v) => canonical(v) === target)) return h;

  const untouched =
    previousDefault !== null ? active !== undefined && canonical(active) === canonical(previousDefault) : h.versions.length === 1;
  const offered = propose(h, newDefault);
  return untouched ? accept(offered) : offered;
}
