import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { nodeSqlite } from '../../__fixtures__/node-sqlite';
import { sampleLayer } from '../../__fixtures__/sample-layer';
import type { AssistantMessage, ModelProvider, StopReason } from '../../agent/provider';
import type { DailyReminder, Notifier } from '../../capabilities/reminders';
import { openKeyValue } from '../../data/sql-store';
import type { SqlDatabase } from '../../data/sql';
import type { UserLayer } from '../../user-layer/document';
import { accept, createHistory, propose } from '../../user-layer/history';
import { SelfDevApp, type AiSettings, type PlatformServices, type UpdatesView } from '../SelfDevApp';

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

describe('app updates', () => {
  function withUpdates(view: Partial<UpdatesView>) {
    const calls: string[] = [];
    const s = services(nodeSqlite());
    const updates: UpdatesView = {
      status: 'idle',
      check: async () => void calls.push('check'),
      restart: async () => void calls.push('restart'),
      ...view,
    };
    s.services.useUpdates = () => updates;
    return { s, calls };
  }

  it('shows download progress of a found update', async () => {
    const { s } = withUpdates({ status: 'downloading', progress: 0.42 });

    await render(<SelfDevApp defaultLayer={layer} services={s.services} />);

    expect(await screen.findByText(/42%/)).toBeOnTheScreen();
  });

  it('asks to restart once a late update is downloaded, and restarts on request', async () => {
    const { s, calls } = withUpdates({ status: 'ready' });
    const user = userEvent.setup();
    await render(<SelfDevApp defaultLayer={layer} services={s.services} autoRestartWindowMs={0} />);

    await user.press(await screen.findByRole('button', { name: 'Restart' }));

    expect(calls).toEqual(['restart']);
  });

  it('checks for updates on request from the AI screen and reports an up-to-date app', async () => {
    const { s, calls } = withUpdates({ status: 'idle' });
    const user = userEvent.setup();
    await render(<SelfDevApp defaultLayer={layer} services={s.services} />);
    await user.press(await screen.findByRole('button', { name: 'AI' }));

    await user.press(screen.getByRole('button', { name: 'Check for updates' }));

    expect(calls).toEqual(['check']);
    expect(await screen.findByText('The latest version is installed')).toBeOnTheScreen();
  });

  it('shows why a check failed', async () => {
    const { s } = withUpdates({ status: 'error', error: 'network down' });

    await render(<SelfDevApp defaultLayer={layer} services={s.services} />);

    expect(await screen.findByText(/network down/)).toBeOnTheScreen();
  });

  describe('automatic restart', () => {
    /** An update service whose status the test moves, like expo-updates does on its own. */
    function liveUpdates() {
      const calls: string[] = [];
      let status: UpdatesView['status'] = 'idle';
      const s = services(nodeSqlite());
      s.services.useUpdates = () => ({
        status,
        check: async () => void calls.push('check'),
        restart: async () => void calls.push('restart'),
      });
      return { s, calls, set: (v: UpdatesView['status']) => (status = v) };
    }

    it('restarts by itself when an update finishes downloading right after launch', async () => {
      const u = liveUpdates();
      await render(<SelfDevApp defaultLayer={layer} services={u.s.services} autoRestartWindowMs={60_000} />);
      await screen.findByRole('header', { name: 'Today' });

      u.set('ready');
      await screen.rerender(<SelfDevApp defaultLayer={layer} services={u.s.services} autoRestartWindowMs={60_000} />);

      await waitFor(() => expect(u.calls).toEqual(['restart']));
    });

    it('waits for the user when an update arrives later, so nothing typed is lost', async () => {
      const u = liveUpdates();
      await render(<SelfDevApp defaultLayer={layer} services={u.s.services} autoRestartWindowMs={0} />);
      await screen.findByRole('header', { name: 'Today' });

      u.set('ready');
      await screen.rerender(<SelfDevApp defaultLayer={layer} services={u.s.services} autoRestartWindowMs={0} />);

      expect(await screen.findByRole('button', { name: 'Restart' })).toBeOnTheScreen();
      expect(u.calls).toEqual([]);
    });

    it('restarts by itself after an update the user asked for', async () => {
      const u = liveUpdates();
      const user = userEvent.setup();
      await render(<SelfDevApp defaultLayer={layer} services={u.s.services} autoRestartWindowMs={0} />);
      await user.press(await screen.findByRole('button', { name: 'AI' }));
      await user.press(screen.getByRole('button', { name: 'Check for updates' }));

      u.set('ready');
      await screen.rerender(<SelfDevApp defaultLayer={layer} services={u.s.services} autoRestartWindowMs={0} />);

      await waitFor(() => expect(u.calls).toEqual(['check', 'restart']));
    });
  });

  it('shows which version of the app is running on the AI screen', async () => {
    const { s } = withUpdates({ status: 'idle', version: '20.10 10:30 · 010a08f4' });
    const user = userEvent.setup();
    await render(<SelfDevApp defaultLayer={layer} services={s.services} />);

    await user.press(await screen.findByRole('button', { name: 'AI' }));

    expect(screen.getByText('Version: 20.10 10:30 · 010a08f4')).toBeOnTheScreen();
  });

  it('offers no update check when the build has no update service', async () => {
    const user = userEvent.setup();
    await render(<SelfDevApp defaultLayer={layer} services={services(nodeSqlite()).services} />);
    await user.press(await screen.findByRole('button', { name: 'AI' }));

    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();
  });
});

describe('SelfDevApp', () => {
  it('boots into the default layer', async () => {
    await render(<SelfDevApp defaultLayer={layer} services={services(nodeSqlite()).services} />);

    expect(await screen.findByRole('header', { name: 'Today' })).toBeOnTheScreen();
  });

  it('says a layer action is running in the app\'s words', async () => {
    const acting: UserLayer = {
      ...layer,
      screens: { ...layer.screens, today: { title: 'Today', body: [{ type: 'action', label: 'Sync', action: 'sync' }] } },
    };
    const actions = { sync: { description: 'x', run: () => new Promise<string>(() => {}) } };
    await render(
      <SelfDevApp
        defaultLayer={acting}
        services={services(nodeSqlite()).services}
        actions={actions}
        strings={{ running: 'Выполняется…' }}
      />
    );

    fireEvent.press(await screen.findByRole('button', { name: 'Sync' }));

    expect(await screen.findByText('Выполняется…')).toBeOnTheScreen();
  });

  it('restores the layer saved by an earlier run', async () => {
    const db = nodeSqlite();
    await (await openKeyValue(db)).set('layer-history', accept(propose(createHistory(layer), proposed)));

    await render(<SelfDevApp defaultLayer={layer} services={services(db).services} />);

    expect(await screen.findByRole('tab', { name: 'Trends' })).toBeOnTheScreen();
  });

  it('brings a new default layer from an app update to an install that never changed its layer', async () => {
    const db = nodeSqlite();
    await (await openKeyValue(db)).set('layer-history', createHistory(layer));

    await render(<SelfDevApp defaultLayer={proposed} services={services(db).services} />);

    expect(await screen.findByRole('tab', { name: 'Trends' })).toBeOnTheScreen();
    await waitFor(async () => expect(await (await openKeyValue(db)).get('default-layer')).toEqual(proposed));
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
