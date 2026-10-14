import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { nodeSqlite } from '../../__fixtures__/node-sqlite';
import { sampleLayer } from '../../__fixtures__/sample-layer';
import type { AssistantMessage, ModelProvider, StopReason } from '../../agent/provider';
import type { DailyReminder, Notifier } from '../../capabilities/reminders';
import { openKeyValue } from '../../data/sql-store';
import type { SqlDatabase } from '../../data/sql';
import type { UserLayer } from '../../user-layer/document';
import { accept, createHistory, propose } from '../../user-layer/history';
import { SelfDevApp, type AiSettings, type PlatformServices } from '../SelfDevApp';

const layer: UserLayer = {
  ...sampleLayer,
  reminders: [{ id: 'evening', time: '21:00', title: 'Diary' }],
};
const proposed: UserLayer = { ...layer, tabs: [...layer.tabs, { screen: 'history', title: 'Trends' }] };

type Turn = { message: AssistantMessage; stop: StopReason };

function services(db: SqlDatabase, script: Turn[] = []) {
  const scheduled: DailyReminder[][] = [];
  const secrets = new Map<string, string>();
  const providers: { settings: AiSettings; key: string }[] = [];
  let turn = 0;
  const notifier: Notifier = {
    async cancelAll() {
      scheduled.push([]);
    },
    async scheduleDaily(r) {
      scheduled.at(-1)!.push(r);
    },
  };
  const s: PlatformServices = {
    openDatabase: async () => db,
    notifier,
    secrets: {
      get: async (k) => secrets.get(k) ?? null,
      set: async (k, v) => void secrets.set(k, v),
    },
    createProvider(settings, key): ModelProvider {
      providers.push({ settings, key });
      return { complete: async () => script[turn++] ?? { message: { role: 'assistant', content: [] }, stop: 'end' } };
    },
  };
  return { services: s, scheduled, secrets, providers };
}

const proposeTurn: Turn = {
  message: { role: 'assistant', content: [{ type: 'tool_call', id: 't1', name: 'propose_layer', input: { layer: proposed } }] },
  stop: 'tool_calls',
};
const doneTurn: Turn = { message: { role: 'assistant', content: [{ type: 'text', text: 'Added a Trends tab.' }] }, stop: 'end' };

async function savedHistory(db: SqlDatabase) {
  return (await openKeyValue(db)).get('layer-history') as Promise<{ unfinishedLaunches: number; accepted: number[] }>;
}

async function askAgent(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.press(screen.getByRole('button', { name: 'AI' }));
  await user.type(screen.getByLabelText('Message'), text);
  await user.press(screen.getByRole('button', { name: 'Send' }));
}

describe('SelfDevApp', () => {
  it('boots into the default layer', async () => {
    await render(<SelfDevApp defaultLayer={layer} services={services(nodeSqlite()).services} />);

    expect(await screen.findByRole('header', { name: 'Today' })).toBeOnTheScreen();
  });

  it('restores the layer saved by an earlier run', async () => {
    const db = nodeSqlite();
    await (await openKeyValue(db)).set('layer-history', accept(propose(createHistory(layer), proposed)));

    await render(<SelfDevApp defaultLayer={layer} services={services(db).services} />);

    expect(await screen.findByRole('tab', { name: 'Trends' })).toBeOnTheScreen();
  });

  it('counts a launch as complete once the screen has been laid out', async () => {
    const db = nodeSqlite();
    await render(<SelfDevApp defaultLayer={layer} services={services(db).services} />);
    await screen.findByRole('header', { name: 'Today' });
    await waitFor(async () => expect((await savedHistory(db)).unfinishedLaunches).toBe(1));

    fireEvent(screen.getByTestId('selfdev-root'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } });

    await waitFor(async () => expect((await savedHistory(db)).unfinishedLaunches).toBe(0));
  });

  it('shows the last working version with a notice after repeated crashes', async () => {
    const db = nodeSqlite();
    const crashing = { ...accept(propose(createHistory(layer), proposed)), lastGood: 0, unfinishedLaunches: 2 };
    await (await openKeyValue(db)).set('layer-history', crashing);

    await render(<SelfDevApp defaultLayer={layer} services={services(db).services} />);

    expect(await screen.findByText(/Safe mode/)).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Trends' })).toBeNull();
  });

  it('schedules the reminders of the rendered layer', async () => {
    const s = services(nodeSqlite());
    await render(<SelfDevApp defaultLayer={layer} services={s.services} />);

    await waitFor(() => expect(s.scheduled.at(-1)).toEqual([{ id: 'evening', hour: 21, minute: 0, title: 'Diary', body: undefined }]));
  });

  it('asks for an API key before the agent can work, and keeps it in secret storage', async () => {
    const s = services(nodeSqlite());
    const user = userEvent.setup();
    await render(<SelfDevApp defaultLayer={layer} services={s.services} />);
    await user.press(await screen.findByRole('button', { name: 'AI' }));

    await user.type(screen.getByLabelText('API key'), 'sk-test');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(s.secrets.get('ai-api-key')).toBe('sk-test');
    expect(screen.getByLabelText('Message')).toBeOnTheScreen();
  });

  describe('with a configured agent', () => {
    async function setup() {
      const db = nodeSqlite();
      const s = services(db, [proposeTurn, doneTurn]);
      s.secrets.set('ai-api-key', 'sk-test');
      const user = userEvent.setup();
      await render(<SelfDevApp defaultLayer={layer} services={s.services} appGuide="A mood diary." />);
      await screen.findByRole('header', { name: 'Today' });
      return { db, s, user };
    }

    it('shows the agent reply and previews its proposal', async () => {
      const { user } = await setup();

      await askAgent(user, 'add a trends tab');

      expect(await screen.findByText('Added a Trends tab.')).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByText('Preview')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Trends' })).toBeOnTheScreen();
    });

    it('creates the provider from the saved settings and key', async () => {
      const { s, user } = await setup();

      await askAgent(user, 'hi');

      await waitFor(() => expect(s.providers[0]).toEqual({ settings: expect.objectContaining({ provider: 'anthropic' }), key: 'sk-test' }));
    });

    it('keeps an accepted proposal across restarts', async () => {
      const { db, user } = await setup();
      await askAgent(user, 'add a trends tab');
      await screen.findByText('Added a Trends tab.');
      await user.press(screen.getByRole('button', { name: 'Back' }));

      await user.press(screen.getByRole('button', { name: 'Accept' }));

      expect(screen.queryByText('Preview')).toBeNull();
      await waitFor(async () => expect((await savedHistory(db)).accepted).toHaveLength(2));
    });

    it('returns to the previous layer when the proposal is discarded', async () => {
      const { user } = await setup();
      await askAgent(user, 'add a trends tab');
      await screen.findByText('Added a Trends tab.');
      await user.press(screen.getByRole('button', { name: 'Back' }));

      await user.press(screen.getByRole('button', { name: 'Discard' }));

      expect(screen.queryByRole('tab', { name: 'Trends' })).toBeNull();
    });

    it('undoes an accepted change', async () => {
      const { user } = await setup();
      await askAgent(user, 'add a trends tab');
      await screen.findByText('Added a Trends tab.');
      await user.press(screen.getByRole('button', { name: 'Back' }));
      await user.press(screen.getByRole('button', { name: 'Accept' }));

      await user.press(screen.getByRole('button', { name: 'AI' }));
      await user.press(screen.getByRole('button', { name: 'Undo last change' }));
      await user.press(screen.getByRole('button', { name: 'Back' }));

      expect(screen.queryByRole('tab', { name: 'Trends' })).toBeNull();
    });
  });
});
