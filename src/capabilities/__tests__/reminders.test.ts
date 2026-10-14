import { syncReminders, type DailyReminder, type Notifier } from '../reminders';

/** Records what the platform asked the OS notification layer to do, in order. */
function recordingNotifier() {
  const calls: (['cancelAll'] | ['scheduleDaily', DailyReminder])[] = [];
  const notifier: Notifier = {
    async cancelAll() {
      calls.push(['cancelAll']);
    },
    async scheduleDaily(r) {
      calls.push(['scheduleDaily', r]);
    },
  };
  return { notifier, calls };
}

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
});
