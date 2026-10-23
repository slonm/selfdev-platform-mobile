import type { DataStore } from '../data/store';
import type { UserLayer } from '../user-layer/document';

/** What an action gets to work with. */
export type ActionContext = {
  store: DataStore;
  /** The layer being shown: its collections name and describe the data (e.g. for an export). */
  layer?: UserLayer;
  /**
   * Writes a consistent copy of the whole database to a fresh file and returns its URI; absent when
   * the build cannot (no file system).
   */
  snapshotDatabase?: () => Promise<string>;
};

/**
 * Something an app can do that the declarative kit cannot: pick a file, talk to a sensor, run heavy
 * maths. The user layer triggers it by name with an `action` node; the agent sees the description.
 * `run` may add records through the store and returns an optional message for the user.
 */
export type AppAction = {
  description: string;
  run(ctx: ActionContext): Promise<string | void>;
};

export type AppActions = Record<string, AppAction>;
