import { validateLayer } from '../document';

/** A small but complete layer: a diary collection, a form screen, a history screen. */
function sampleLayer(): any {
  return {
    schemaVersion: 1,
    collections: {
      diary: {
        fields: {
          mood: { type: 'number' },
          note: { type: 'text' },
        },
      },
    },
    screens: {
      today: {
        title: 'Today',
        body: [
          { type: 'text', value: 'How was the day?' },
          {
            type: 'form',
            collection: 'diary',
            submitLabel: 'Save',
            fields: [
              { type: 'scale', field: 'mood', label: 'Mood', min: 0, max: 4 },
              { type: 'textInput', field: 'note', label: 'Note', multiline: true },
            ],
          },
          { type: 'button', label: 'History', navigate: 'history' },
        ],
      },
      history: {
        title: 'History',
        body: [
          { type: 'chart', collection: 'diary', series: ['mood'] },
          { type: 'list', collection: 'diary', fields: ['mood', 'note'] },
        ],
      },
    },
    tabs: [
      { screen: 'today', title: 'Today' },
      { screen: 'history', title: 'History' },
    ],
  };
}

function errorPaths(input: unknown): (string | number)[][] {
  const r = validateLayer(input);
  return r.ok ? [] : r.errors.map((e) => e.path);
}

describe('validateLayer', () => {
  it('accepts a complete layer and returns it typed', () => {
    const r = validateLayer(sampleLayer());

    expect(r.ok).toBe(true);
    expect(r.ok && r.layer.tabs.map((t) => t.screen)).toEqual(['today', 'history']);
  });

  it('rejects an unsupported schema version', () => {
    const layer = { ...sampleLayer(), schemaVersion: 2 };

    expect(errorPaths(layer)).toContainEqual(['schemaVersion']);
  });

  it('rejects a node type the component kit does not have, pointing at the node', () => {
    const layer = sampleLayer();
    layer.screens.today.body[0] = { type: 'video', src: 'x' };

    expect(errorPaths(layer)).toContainEqual(['screens', 'today', 'body', 0, 'type']);
  });

  it('rejects a scale whose minimum is not below its maximum', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].fields[0].min = 4;

    expect(errorPaths(layer)).toContainEqual(['screens', 'today', 'body', 1, 'fields', 0, 'max']);
  });

  it('rejects a tab pointing at a missing screen', () => {
    const layer = sampleLayer();
    layer.tabs[1].screen = 'nowhere';

    expect(errorPaths(layer)).toEqual([['tabs', 1, 'screen']]);
  });

  it('rejects a layer with no tabs', () => {
    const layer = { ...sampleLayer(), tabs: [] };

    expect(errorPaths(layer)).toContainEqual(['tabs']);
  });

  it('rejects a button navigating to a missing screen', () => {
    const layer = sampleLayer();
    layer.screens.today.body[2].navigate = 'nowhere';

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 2, 'navigate']]);
  });

  it('rejects a form, list or chart bound to a missing collection', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].collection = 'nope';
    layer.screens.history.body[0].collection = 'nope';
    layer.screens.history.body[1].collection = 'nope';

    expect(errorPaths(layer)).toEqual([
      ['screens', 'today', 'body', 1, 'collection'],
      ['screens', 'history', 'body', 0, 'collection'],
      ['screens', 'history', 'body', 1, 'collection'],
    ]);
  });

  it('rejects an input bound to a field its collection does not define', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].fields[1].field = 'energy';

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'fields', 1, 'field']]);
  });

  it('rejects a scale bound to a text field', () => {
    const layer = sampleLayer();
    layer.collections.diary.fields.title = { type: 'text' };
    layer.screens.today.body[1].fields[0].field = 'title';

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'fields', 0, 'field']]);
  });

  it('rejects a text input bound to a number field', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].fields[1].field = 'mood';

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'fields', 1, 'field']]);
  });

  it('rejects a chart series that is not a number field', () => {
    const layer = sampleLayer();
    layer.screens.history.body[0].series = ['mood', 'note', 'missing'];

    expect(errorPaths(layer)).toEqual([
      ['screens', 'history', 'body', 0, 'series', 1],
      ['screens', 'history', 'body', 0, 'series', 2],
    ]);
  });

  it('rejects a list column its collection does not define', () => {
    const layer = sampleLayer();
    layer.screens.history.body[1].fields = ['mood', 'missing'];

    expect(errorPaths(layer)).toEqual([['screens', 'history', 'body', 1, 'fields', 1]]);
  });

  it('accepts daily reminders', () => {
    const layer = { ...sampleLayer(), reminders: [{ id: 'evening', time: '21:00', title: 'Diary', body: 'Fill in today' }] };

    expect(validateLayer(layer).ok).toBe(true);
  });

  it.each(['25:00', '21:60', '9:30', '21-00'])('rejects reminder time %s', (time) => {
    const layer = { ...sampleLayer(), reminders: [{ id: 'r', time, title: 'x' }] };

    expect(errorPaths(layer)).toEqual([['reminders', 0, 'time']]);
  });

  it('rejects two reminders with the same id', () => {
    const layer = {
      ...sampleLayer(),
      reminders: [
        { id: 'r', time: '08:00', title: 'a' },
        { id: 'r', time: '21:00', title: 'b' },
      ],
    };

    expect(errorPaths(layer)).toEqual([['reminders', 1, 'id']]);
  });

  it('rejects a property the format does not define, pointing at the property', () => {
    const layer = { ...sampleLayer(), remniders: [] };
    layer.screens.today.body[0].colour = 'red';

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 0, 'colour'], ['remniders']]);
  });

  it('rejects an unknown property on a scale too', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].fields[0].minlabel = 'low';

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'fields', 0, 'minlabel']]);
  });

  it('rejects a scale with more than 11 steps', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].fields[0].max = 11;

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'fields', 0, 'max']]);
  });

  it('accepts a scale of exactly 11 steps', () => {
    const layer = sampleLayer();
    layer.screens.today.body[1].fields[0].max = 10;

    expect(validateLayer(layer).ok).toBe(true);
  });

  it('rejects a form with two inputs for the same field', () => {
    const layer = sampleLayer();
    layer.collections.diary.fields.energy = { type: 'number' };
    layer.screens.today.body[1].fields.push({ type: 'scale', field: 'mood', label: 'Again', min: 0, max: 4 });

    expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'fields', 2, 'field']]);
  });

  it('rejects a field repeated in chart series or list columns', () => {
    const layer = sampleLayer();
    layer.screens.history.body[0].series = ['mood', 'mood'];
    layer.screens.history.body[1].fields = ['note', 'note'];

    expect(errorPaths(layer)).toEqual([
      ['screens', 'history', 'body', 0, 'series', 1],
      ['screens', 'history', 'body', 1, 'fields', 1],
    ]);
  });

  describe('computed collections', () => {
    function withComputed(): any {
      const layer = sampleLayer();
      layer.collections.moodAvg = { fields: { mean: { type: 'number' } }, compute: 'avg' };
      layer.scripts = {
        avg: {
          source: 'function main(input) { return []; }',
          tests: [{ name: 'empty', input: { collections: { diary: [] } }, expect: [] }],
        },
      };
      layer.screens.history.body.push({ type: 'chart', collection: 'moodAvg', series: ['mean'] });
      return layer;
    }

    it('accepts a collection computed by a script', () => {
      expect(validateLayer(withComputed()).ok).toBe(true);
    });

    it('rejects a computed collection whose script does not exist', () => {
      const layer = withComputed();
      layer.collections.moodAvg.compute = 'missing';

      expect(errorPaths(layer)).toEqual([['collections', 'moodAvg', 'compute']]);
    });

    it('rejects a form writing into a computed collection', () => {
      const layer = withComputed();
      layer.screens.today.body[1].collection = 'moodAvg';
      layer.screens.today.body[1].fields = [{ type: 'scale', field: 'mean', label: 'm', min: 0, max: 4 }];

      expect(errorPaths(layer)).toEqual([['screens', 'today', 'body', 1, 'collection']]);
    });

    it('rejects a script without tests', () => {
      const layer = withComputed();
      layer.scripts.avg.tests = [];

      expect(errorPaths(layer)).toContainEqual(['scripts', 'avg', 'tests']);
    });
  });

  it('reports something readable for every error', () => {
    const r = validateLayer({ schemaVersion: 1 });

    expect(r.ok).toBe(false);
    const errors = r.ok ? [] : r.errors;
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.message.length > 0)).toBe(true);
  });
});
