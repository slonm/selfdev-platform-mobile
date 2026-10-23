import type { DataStore } from '../data/store';
import type { Reminder } from '../user-layer/document';

/** A reminder resolved to the fields an OS notification scheduler needs. */
export type DailyReminder = { id: string; hour: number; minute: number; title: string; body?: string };

/** One notification at `at` (epoch ms); `id` is unique per occurrence. */
export type OnceReminder = { id: string; at: number; title: string; body?: string };

/**
 * The OS notification scheduler as the platform uses it; the device implementation wraps
 * expo-notifications. Only notifications created by the platform may be cancelled by `cancelAll`.
 */
export interface Notifier {
  cancelAll(): Promise<void>;
  scheduleDaily(r: DailyReminder): Promise<void>;
  scheduleOnce(r: OnceReminder): Promise<void>;
}

/**
 * How many days ahead a reminder with `skipIfRecorded` is laid out. A repeating OS notification
 * cannot drop a single day, so such reminders are one notification per day, renewed on every sync;
 * an app left closed for longer than this stops reminding.
 */
export const PLAN_DAYS = 14;

/** How many weeks ahead a weekly reminder is laid out, for the same reason. */
export const PLAN_WEEKS = 8;

const HOUR = 3_600_000;

/**
 * Makes the OS schedule equal to the layer's reminders: clears what was scheduled, then schedules
 * each reminder daily. A weekly reminder (`weekday`) or one with `skipIfRecorded` is scheduled
 * occurrence by occurrence instead (PLAN_DAYS days or PLAN_WEEKS weeks ahead), leaving out
 * occurrences whose window already holds a record of `store`; call again when such records change.
 * Call after a layer version becomes rendered (accept, undo, safe mode).
 * Expects a validated layer, so times are well-formed.
 */
export async function syncReminders(
  reminders: Reminder[] | undefined,
  notifier: Notifier,
  opts: { store?: DataStore; now?: number } = {}
): Promise<void> {
  const now = opts.now ?? Date.now();
  await notifier.cancelAll();
  for (const r of reminders ?? []) {
    // Validated as HH:MM.
    const hour = Number(r.time.slice(0, 2));
    const minute = Number(r.time.slice(3, 5));
    if (!r.skipIfRecorded && r.weekday === undefined) {
      await notifier.scheduleDaily({ id: r.id, hour, minute, title: r.title, body: r.body });
      continue;
    }
    const skip = r.skipIfRecorded;
    const times = skip ? (opts.store?.list(skip.collection) ?? []).map((rec) => rec.createdAt) : [];
    const plan =
      r.weekday === undefined
        ? nextOccurrences(now, hour, minute, PLAN_DAYS, 1)
        : nextOccurrences(now, hour, minute, PLAN_WEEKS, 7, r.weekday % 7);
    for (const at of plan) {
      if (skip && times.some((t) => t <= at && t >= at - skip.withinHours * HOUR)) continue;
      await notifier.scheduleOnce({ id: `${r.id}@${at}`, at, title: r.title, body: r.body });
    }
  }
}

/**
 * The next `count` local times `hour:minute` strictly after `now`, `stepDays` apart; with `jsWeekday`
 * (0 Sunday … 6 Saturday, as Date.getDay) only on that weekday.
 */
function nextOccurrences(now: number, hour: number, minute: number, count: number, stepDays: number, jsWeekday?: number): number[] {
  const first = new Date(now);
  first.setHours(hour, minute, 0, 0);
  while (first.getTime() <= now || (jsWeekday !== undefined && first.getDay() !== jsWeekday)) first.setDate(first.getDate() + 1);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(first);
    day.setDate(first.getDate() + i * stepDays);
    return day.getTime();
  });
}
