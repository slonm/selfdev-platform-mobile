import { act, render, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { sampleLayer } from '../../__fixtures__/sample-layer';
import { createMemoryStore } from '../../data/memory-store';
import type { UserLayer } from '../../user-layer/document';
import { LayerView } from '../LayerView';

async function setup() {
  const store = createMemoryStore(() => Date.UTC(2026, 9, 14, 21, 0));
  const user = userEvent.setup();
  await render(<LayerView layer={sampleLayer} store={store} />);
  return { store, user };
}

describe('LayerView', () => {
  it('opens on the first tab', async () => {
    await setup();

    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
    expect(screen.getByText('How was the day?')).toBeOnTheScreen();
  });

  it('saves a form as one record of its collection', async () => {
    const { store, user } = await setup();

    await user.press(screen.getByRole('button', { name: 'Mood 3' }));
    await user.type(screen.getByLabelText('Note'), 'calm');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(store.list('diary').map((r) => r.values)).toEqual([{ mood: 3, note: 'calm' }]);
  });

  it('clears the form after saving', async () => {
    const { user } = await setup();

    await user.press(screen.getByRole('button', { name: 'Mood 3' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: 'Mood 3' })).not.toBeSelected();
  });

  it('marks the chosen scale value as selected', async () => {
    const { user } = await setup();

    await user.press(screen.getByRole('button', { name: 'Mood 2' }));

    expect(screen.getByRole('button', { name: 'Mood 2' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Mood 1' })).not.toBeSelected();
  });

  it('does not save an empty form', async () => {
    const { store, user } = await setup();

    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(store.list('diary')).toHaveLength(0);
  });

  it('navigates with a button and comes back', async () => {
    const { user } = await setup();

    await user.press(screen.getByRole('button', { name: 'History' }));
    expect(screen.getByRole('header', { name: 'History' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
  });

  it('switches screens from the tab bar', async () => {
    const { user } = await setup();

    await user.press(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByText('A diary.')).toBeOnTheScreen();
  });

  it('lists records newest first with their field values', async () => {
    const { store, user } = await setup();
    store.add('diary', { mood: 1, note: 'first' });
    store.add('diary', { mood: 4, note: 'second' });

    await user.press(screen.getByRole('button', { name: 'History' }));

    const rows = screen.getAllByTestId('list-row').map((r) => r.props.accessibilityLabel);
    expect(rows).toEqual([expect.stringContaining('second'), expect.stringContaining('first')]);
  });

  it('plots one point per record for each chart series', async () => {
    const { store, user } = await setup();
    store.add('diary', { mood: 1 });
    store.add('diary', { mood: 4 });

    await user.press(screen.getByRole('button', { name: 'History' }));

    expect(screen.getAllByLabelText(/^mood \d/).map((p) => p.props.accessibilityLabel)).toEqual([
      'mood 1',
      'mood 4',
    ]);
  });

  it('charts a collection computed by a script', async () => {
    const layer: UserLayer = {
      ...sampleLayer,
      collections: { ...sampleLayer.collections, doubled: { fields: { x: { type: 'number' } }, compute: 'double' } },
      scripts: {
        double: {
          source:
            'function main(i) { return i.collections.diary.map(function (r) { return { createdAt: r.createdAt, values: { x: r.values.mood * 2 } }; }); }',
          tests: [{ name: 't', input: { collections: { diary: [] } }, expect: [] }],
        },
      },
      screens: { ...sampleLayer.screens, about: { title: 'About', body: [{ type: 'chart', collection: 'doubled', series: ['x'] }] } },
    };
    const store = createMemoryStore(() => 1);
    store.add('diary', { mood: 2 });
    const user = userEvent.setup();
    await render(<LayerView layer={layer} store={store} />);

    await user.press(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByLabelText('x 4')).toBeOnTheScreen();
  });

  describe('when the layer changes (preview, accept, undo)', () => {
    it('falls back to the first tab when the open tab no longer exists', async () => {
      const { store, user } = await setup();
      await user.press(screen.getByRole('tab', { name: 'About' }));

      await screen.rerender(<LayerView layer={{ ...sampleLayer, tabs: [sampleLayer.tabs[0]!] }} store={store} />);

      expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
    });

    it('leaves a screen that no longer exists', async () => {
      const { store, user } = await setup();
      await user.press(screen.getByRole('button', { name: 'History' }));
      const { history: _gone, ...screens } = sampleLayer.screens;
      const today = { ...screens.today!, body: screens.today!.body.filter((n) => n.type !== 'button') };

      await screen.rerender(<LayerView layer={{ ...sampleLayer, screens: { ...screens, today } }} store={store} />);

      expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
    });

    it('drops form input made against the previous layer', async () => {
      const { store, user } = await setup();
      await user.press(screen.getByRole('button', { name: 'Mood 3' }));

      await screen.rerender(<LayerView layer={structuredClone(sampleLayer)} store={store} />);
      await user.press(screen.getByRole('button', { name: 'Save' }));

      expect(store.list('diary')).toHaveLength(0);
    });
  });

  it('keeps negative values distinguishable from zero on a chart', async () => {
    const layer: UserLayer = {
      ...sampleLayer,
      screens: { ...sampleLayer.screens, about: { title: 'About', body: [{ type: 'chart', collection: 'diary', series: ['mood'] }] } },
    };
    const store = createMemoryStore(() => 1);
    for (const mood of [-2, 0, 2]) store.add('diary', { mood });
    const user = userEvent.setup();
    await render(<LayerView layer={layer} store={store} />);
    await user.press(screen.getByRole('tab', { name: 'About' }));

    const height = (label: string) => StyleSheet.flatten(screen.getByLabelText(label).props.style).height as number;

    expect(height('mood -2')).toBeLessThan(height('mood 0'));
    expect(height('mood 0')).toBeLessThan(height('mood 2'));
  });

  describe('action buttons', () => {
    function actionLayer(): UserLayer {
      return {
        ...sampleLayer,
        screens: { ...sampleLayer.screens, about: { title: 'About', body: [{ type: 'action', label: 'Import', action: 'importNight' }] } },
      };
    }

    it('runs the app action with the data store and shows its message', async () => {
      const store = createMemoryStore(() => 1);
      const actions = {
        importNight: {
          description: 'imports a night',
          run: async (ctx: { store: typeof store }) => {
            ctx.store.add('diary', { mood: 1 });
            return 'Imported 1 night';
          },
        },
      };
      const user = userEvent.setup();
      await render(<LayerView layer={actionLayer()} store={store} actions={actions} />);
      await user.press(screen.getByRole('tab', { name: 'About' }));

      await user.press(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText('Imported 1 night')).toBeOnTheScreen();
      expect(store.list('diary')).toHaveLength(1);
    });

    it('shows the error of a failing action instead of crashing', async () => {
      const actions = {
        importNight: {
          description: 'x',
          run: async () => {
            throw new Error('no file chosen');
          },
        },
      };
      const user = userEvent.setup();
      await render(<LayerView layer={actionLayer()} store={createMemoryStore()} actions={actions} />);
      await user.press(screen.getByRole('tab', { name: 'About' }));

      await user.press(screen.getByRole('button', { name: 'Import' }));

      expect(await screen.findByText(/no file chosen/)).toBeOnTheScreen();
    });
  });

  it('shows records added elsewhere without a reload', async () => {
    const { store, user } = await setup();
    await user.press(screen.getByRole('button', { name: 'History' }));

    await act(async () => {
      store.add('diary', { mood: 2, note: 'from agent' });
    });

    expect(screen.getAllByTestId('list-row')).toHaveLength(1);
  });
});
