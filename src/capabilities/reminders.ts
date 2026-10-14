import type { Reminder } from '../user-layer/document';

/** A reminder resolved to the fields an OS notification scheduler needs. */
export type DailyReminder = { id: string; hour: number; minute: number; title: string; body?: string };

/**
 * The OS notification scheduler as the platform uses it; the device implementation wraps
 * expo-notifications. Only notifications created by the platform may be cancelled by `cancelAll`.
 */
export interface Notifier {
  cancelAll(): Promise<void>;
  scheduleDaily(r: DailyReminder): Promise<void>;
}

/**
 * Makes the OS schedule equal to the layer's reminders: clears what was scheduled, then schedules
 * each reminder daily. Call after a layer version becomes rendered (accept, undo, safe mode).
 * Expects a validated layer, so times are well-formed.
 */
export async function syncReminders(reminders: Reminder[] | undefined, notifier: Notifier): Promise<void> {
  await notifier.cancelAll();
  for (const r of reminders ?? []) {
    const [hour, minute] = r.time.split(':').map(Number);
    await notifier.scheduleDaily({ id: r.id, hour, minute, title: r.title, body: r.body });
  }
}
