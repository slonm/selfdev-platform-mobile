import type { DataStore } from '../data/store';

/**
 * Something an app can do that the declarative kit cannot: pick a file, talk to a sensor, run heavy
 * maths. The user layer triggers it by name with an `action` node; the agent sees the description.
 * `run` may add records through the store and returns an optional message for the user.
 */
export type AppAction = {
  description: string;
  run(ctx: { store: DataStore }): Promise<string | void>;
};

export type AppActions = Record<string, AppAction>;
