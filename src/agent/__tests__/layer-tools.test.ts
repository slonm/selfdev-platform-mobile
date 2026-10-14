import { sampleLayer } from '../../__fixtures__/sample-layer';
import { createMemoryStore } from '../../data/memory-store';
import type { UserLayer } from '../../user-layer/document';
import { createHistory, rendered, type History } from '../../user-layer/history';
import { createLayerTools } from '../layer-tools';

function session() {
  let history: History<UserLayer> = createHistory(sampleLayer);
  const store = createMemoryStore(() => Date.UTC(2026, 9, 14));
  const tools = createLayerTools({
    getHistory: () => history,
    setHistory: (h) => {
      history = h;
    },
    store,
  });
  const run = (name: string, input: unknown) => tools.find((t) => t.name === name)!.run(input);
  return { run, tools, store, history: () => history };
}

describe('layer tools', () => {
  it('reads the layer currently on screen', async () => {
    const { run } = session();

    const r = await run('read_layer', {});

    expect(JSON.parse(r.content)).toEqual(sampleLayer);
  });

  it('puts a valid proposal into preview without accepting it', async () => {
    const s = session();
    const changed = { ...sampleLayer, tabs: [{ screen: 'history', title: 'History' }] };

    const r = await s.run('propose_layer', { layer: changed });

    expect(r.isError).toBeFalsy();
    expect(rendered(s.history())).toEqual(changed);
    expect(s.history().preview).not.toBeNull();
    expect(s.history().accepted).toHaveLength(1);
  });

  it('rejects an invalid proposal with its error paths and changes nothing', async () => {
    const s = session();
    const broken = { ...sampleLayer, tabs: [{ screen: 'nowhere', title: 'x' }] };

    const r = await s.run('propose_layer', { layer: broken });

    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).errors.map((e: { path: unknown }) => e.path)).toEqual([['tabs', 0, 'screen']]);
    expect(s.history().versions).toHaveLength(1);
  });

  it('rejects a proposal whose script tests fail and changes nothing', async () => {
    const s = session();
    const withScript = {
      ...sampleLayer,
      collections: { ...sampleLayer.collections, avg: { fields: { mean: { type: 'number' } }, compute: 'avg' } },
      scripts: {
        avg: { source: 'function main() { return [1]; }', tests: [{ name: 'empty', input: {}, expect: [] }] },
      },
    };

    const r = await s.run('propose_layer', { layer: withScript });

    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).errors.map((e: { path: unknown }) => e.path)).toEqual([['scripts', 'avg', 'tests', 0]]);
    expect(s.history().versions).toHaveLength(1);
  });

  it('rejects a call without a layer', async () => {
    const s = session();

    const r = await s.run('propose_layer', {});

    expect(r.isError).toBe(true);
    expect(s.history().versions).toHaveLength(1);
  });

  it('gives the model the layer format as the input schema of propose_layer', () => {
    const { tools } = session();

    const schema = tools.find((t) => t.name === 'propose_layer')!.inputSchema as any;

    expect(Object.keys(schema.properties.layer.properties)).toEqual(
      expect.arrayContaining(['schemaVersion', 'collections', 'screens', 'tabs', 'reminders'])
    );
    expect(schema.required).toEqual(['layer']);
  });

  it('describes stored data by counts, never by values', async () => {
    const s = session();
    s.store.add('diary', { mood: 2, note: 'private thought' });
    s.store.add('diary', { mood: 3 });

    const r = await s.run('describe_data', {});

    expect(JSON.parse(r.content)).toEqual({ diary: { records: 2, last: '2026-10-14T00:00:00.000Z' } });
    expect(r.content).not.toContain('private thought');
  });
});
