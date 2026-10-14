import { sampleLayer } from '../../__fixtures__/sample-layer';
import type { UserLayer } from '../../user-layer/document';
import { withComputed } from '../computed-store';
import { createMemoryStore } from '../memory-store';

const MEAN = `function main(input) {
  var d = input.collections.diary, s = 0;
  for (var i = 0; i < d.length; i++) s += d[i].values.mood;
  return d.length ? [{ createdAt: d[d.length - 1].createdAt, values: { mean: s / d.length } }] : [];
}`;

function layerWith(source: string): UserLayer {
  return {
    ...sampleLayer,
    collections: { ...sampleLayer.collections, moodAvg: { fields: { mean: { type: 'number' } }, compute: 'avg' } },
    scripts: { avg: { source, tests: [{ name: 't', input: {}, expect: [] }] } },
  };
}

function setup(source = MEAN) {
  let t = 0;
  const base = createMemoryStore(() => ++t);
  const errors: string[] = [];
  const store = withComputed(base, layerWith(source), { onError: (name) => errors.push(name) });
  return { base, store, errors };
}

describe('computed store', () => {
  it('derives a computed collection from the stored ones', () => {
    const { base, store } = setup();
    base.add('diary', { mood: 1 });
    base.add('diary', { mood: 3 });

    expect(store.list('moodAvg').map((r) => [r.createdAt, r.values])).toEqual([[2, { mean: 2 }]]);
  });

  it('passes stored collections through untouched', () => {
    const { base, store } = setup();
    base.add('diary', { mood: 1 });

    expect(store.list('diary')).toBe(base.list('diary'));
  });

  it('keeps the same result until a stored collection changes', () => {
    const { base, store } = setup();
    base.add('diary', { mood: 1 });
    const first = store.list('moodAvg');

    expect(store.list('moodAvg')).toBe(first);
    base.add('diary', { mood: 3 });
    expect(store.list('moodAvg')).not.toBe(first);
  });

  it('refuses to add records to a computed collection', () => {
    const { store } = setup();

    expect(() => store.add('moodAvg', { mean: 1 })).toThrow(/computed/);
  });

  it.each([
    ['not a list', 'function main() { return 5; }'],
    ['a record without createdAt', 'function main() { return [{ values: { mean: 1 } }]; }'],
    ['an undeclared field', 'function main() { return [{ createdAt: 1, values: { other: 1 } }]; }'],
    ['a text value in a number field', 'function main() { return [{ createdAt: 1, values: { mean: "x" } }]; }'],
    ['a failing script', 'function main() { throw new Error("x"); }'],
  ])('shows nothing and reports the collection when the script returns %s', (_, source) => {
    const { store, errors } = setup(source);

    expect(store.list('moodAvg')).toEqual([]);
    expect(errors).toEqual(['moodAvg']);
  });
});
