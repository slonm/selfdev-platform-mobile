import { createMemoryStore } from '../../data/memory-store';
import type { Reminder } from '../../user-layer/document';
import { PLAN_DAYS, PLAN_WEEKS, syncReminders, type DailyReminder, type Notifier, type OnceReminder } from '../reminders';

/** Records what the platform asked the OS notification layer to do, in order. */
function recordingNotifier() {
  const calls: (['cancelAll'] | ['scheduleDaily', DailyReminder] | ['scheduleOnce', OnceReminder])[] = [];
  const notifier: Notifier = {
    async cancelAll() {
      calls.push(['cancelAll']);
    },
    async scheduleDaily(r) {
      calls.push(['scheduleDaily', r]);
    },
    async scheduleOnce(r) {
      calls.push(['scheduleOnce', r]);
    },
  };
  const onceTimes = () => calls.flatMap((c) => (c[0] === 'scheduleOnce' ? [c[1].at] : []));
  return { notifier, calls, onceTimes };
}

/** Local time on 20 October 2026 plus `days`. */
const at = (days: number, hour: number, minute = 0) => new Date(2026, 9, 20 + days, hour, minute).getTime();
const HOUR = 3_600_000;

describe('syncReminders', () => {
  it('replaces whatever was scheduled with the layer reminders', async () => {
    const { notifier, calls } = recordingNotifier();

    await syncReminders(
      [
        { id: 'morning', time: '08:05', title: 'Sleep', body: 'How did you sleep?' },
        { id: 'evening', time: '21:00', title: 'Diary' },
      ],
      notifier
    );

    expect(calls).toEqual([
      ['cancelAll'],
      ['scheduleDaily', { id: 'morning', hour: 8, minute: 5, title: 'Sleep', body: 'How did you sleep?' }],
      ['scheduleDaily', { id: 'evening', hour: 21, minute: 0, title: 'Diary', body: undefined }],
    ]);
  });

  it('clears everything when the layer has no reminders', async () => {
    const { notifier, calls } = recordingNotifier();

    await syncReminders(undefined, notifier);

    expect(calls).toEqual([['cancelAll']]);
  });

  describe('a reminder skipped once its collection got a record shortly before it', () => {
    const evening: Reminder = {
      id: 'evening',
      time: '21:00',
      title: 'Diary',
      skipIfRecorded: { collection: 'diary', withinHours: 12 },
    };

    it('is scheduled once a day for the coming days, starting with the next occurrence', async () => {
      const { notifier, calls, onceTimes } = recordingNotifier();

      await syncReminders([evening], notifier, { store: createMemoryStore(), now: at(0, 22) });

      expect(onceTimes()).toEqual(Array.from({ length: PLAN_DAYS }, (_, d) => at(d + 1, 21)));
      expect(calls[1]).toEqual(['scheduleOnce', { id: `evening@${at(1, 21)}`, at: at(1, 21), title: 'Diary', body: undefined }]);
    });

    it('skips the occurrence whose window already holds a record', async () => {
      const store = createMemoryStore(() => at(0, 20, 30));
      store.add('diary', { mood: 2 });
      const { notifier, onceTimes } = recordingNotifier();

      await syncReminders([evening], notifier, { store, now: at(0, 20, 31) });

      expect(onceTimes()[0]).toBe(at(1, 21));
      expect(onceTimes()).toHaveLength(PLAN_DAYS - 1);
    });

    it('still reminds when the record is older than the window', async () => {
      const store = createMemoryStore(() => at(0, 21) - 12 * HOUR - 1);
      store.add('diary', { mood: 2 });
      const { notifier, onceTimes } = recordingNotifier();

      await syncReminders([evening], notifier, { store, now: at(0, 12) });

      expect(onceTimes()[0]).toBe(at(0, 21));
    });

    it('ignores records of other collections', async () => {
      const store = createMemoryStore(() => at(0, 20));
      store.add('sleep', { quality: 3 });
      const { notifier, onceTimes } = recordingNotifier();

      await syncReminders([evening], notifier, { store, now: at(0, 20, 30) });

      expect(onceTimes()[0]).toBe(at(0, 21));
    });
  });

  describe('a weekly reminder', () => {
    // 20 October 2026 is a Tuesday, so the coming Sunday is the 25th.
    const week: Reminder = {
      id: 'week',
      time: '20:00',
      weekday: 7,
      title: 'Week',
      skipIfRecorded: { collection: 'weekly', withinHours: 168 },
    };

    it('is scheduled once a week on its weekday for the coming weeks', async () => {
      const { notifier, onceTimes } = recordingNotifier();

      await syncReminders([week], notifier, { store: createMemoryStore(), now: at(0, 12) });

      expect(onceTimes()).toEqual(Array.from({ length: PLAN_WEEKS }, (_, w) => at(5 + 7 * w, 20)));
    });

    it('skips the week whose questionnaire is already filled in', async () => {
      const store = createMemoryStore(() => at(3, 10));
      store.add('weekly', { powerful: 0 });
      const { notifier, onceTimes } = recordingNotifier();

      await syncReminders([week], notifier, { store, now: at(3, 11) });

      expect(onceTimes()[0]).toBe(at(12, 20));
    });

    it('is weekly even without a skip rule', async () => {
      const { notifier, onceTimes, calls } = recordingNotifier();
      const { skipIfRecorded: _, ...plain } = week;

      await syncReminders([plain], notifier, { now: at(0, 12) });

      expect(onceTimes()[1]! - onceTimes()[0]!).toBe(7 * 24 * HOUR);
      expect(calls.some((c) => c[0] === 'scheduleDaily')).toBe(false);
    });
  });
});
