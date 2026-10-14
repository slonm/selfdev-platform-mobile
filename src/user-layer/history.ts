/**
 * Version history of a user layer: every change is kept, can be previewed before it takes effect,
 * accepted, discarded or undone, and a change that keeps crashing the app is bypassed automatically.
 *
 * Pure and immutable: every operation returns a new history (or the same one when nothing changes),
 * so the whole object can be persisted as JSON between launches.
 */
export type History<T> = {
  /** Every content ever proposed; the index is the version id. */
  versions: T[];
  /** Ids of accepted versions, oldest first; the last one is active. Never empty. */
  accepted: number[];
  /** Version being tried out, rendered instead of the active one; null when none. */
  preview: number | null;
  /** Last version that completed a launch; null until one does. */
  lastGood: number | null;
  /** Launches started since the last one that completed. */
  unfinishedLaunches: number;
  /** Set after repeated unfinished launches: the last good version is rendered until a change is accepted or undone. */
  safeMode: boolean;
};

/**
 * Unfinished launches, counting the one starting now, that trigger safe mode: two launches crashed
 * and a third begins.
 */
const MAX_UNFINISHED_LAUNCHES = 3;

export function createHistory<T>(content: T): History<T> {
  return { versions: [content], accepted: [0], preview: null, lastGood: null, unfinishedLaunches: 0, safeMode: false };
}

function renderedId<T>(h: History<T>): number {
  if (h.preview !== null) return h.preview;
  if (h.safeMode && h.lastGood !== null) return h.lastGood;
  return h.accepted[h.accepted.length - 1];
}

/** The content the app should show now: preview, else safe-mode fallback, else the active version. */
export function rendered<T>(h: History<T>): T {
  return h.versions[renderedId(h)];
}

/** Adds a new version and starts previewing it; the active version is unchanged. */
export function propose<T>(h: History<T>, content: T): History<T> {
  return { ...h, versions: [...h.versions, content], preview: h.versions.length };
}

/** Makes the previewed version active and leaves safe mode. No-op without a preview. */
export function accept<T>(h: History<T>): History<T> {
  if (h.preview === null) return h;
  return { ...h, accepted: [...h.accepted, h.preview], preview: null, safeMode: false };
}

/** Ends the preview; the version stays in history. */
export function discard<T>(h: History<T>): History<T> {
  return { ...h, preview: null };
}

/** Returns to the previously accepted version, dropping any preview. The first version cannot be undone. */
export function undo<T>(h: History<T>): History<T> {
  const accepted = h.accepted.length > 1 ? h.accepted.slice(0, -1) : h.accepted;
  return { ...h, accepted, preview: null, safeMode: false };
}

/**
 * Records that the app began rendering the user layer. Call before rendering; pair with
 * `launchSucceeded` once the screen is up. Too many unfinished launches in a row switch to safe
 * mode on the last good version, discarding any preview.
 */
export function launchStarted<T>(h: History<T>): History<T> {
  const unfinishedLaunches = h.unfinishedLaunches + 1;
  if (unfinishedLaunches >= MAX_UNFINISHED_LAUNCHES && h.lastGood !== null) {
    return { ...h, unfinishedLaunches: 0, preview: null, safeMode: true };
  }
  return { ...h, unfinishedLaunches };
}

/**
 * Records that the rendered version launched successfully. Only a version the user accepted becomes
 * the safe-mode fallback: a preview that launched fine is still not chosen by the user.
 */
export function launchSucceeded<T>(h: History<T>): History<T> {
  return { ...h, unfinishedLaunches: 0, lastGood: h.preview === null ? renderedId(h) : h.lastGood };
}
