import { createMemoryStore } from '../memory-store';

describe('memory data store', () => {
  it('stamps an added record with an id and the clock time', () => {
    const store = createMemoryStore(() => 1000);

    const rec = store.add('diary', { mood: 3 });

    expect(rec).toEqual({ id: expect.any(String), createdAt: 1000, values: { mood: 3 } });
  });

  it('lists records of one collection in the order they were added', () => {
    let t = 0;
    const store = createMemoryStore(() => ++t);
    store.add('diary', { mood: 1 });
    store.add('other', { x: 'a' });
    store.add('diary', { mood: 2 });

    expect(store.list('diary').map((r) => r.values.mood)).toEqual([1, 2]);
    expect(store.list('empty')).toEqual([]);
  });

  it('keeps an explicit record time, for data imported after the fact', () => {
    const store = createMemoryStore(() => 1000);

    expect(store.add('diary', { mood: 3 }, 400).createdAt).toBe(400);
  });

  it('lists records in time order even when an older one is added later', () => {
    const store = createMemoryStore(() => 1000);
    store.add('diary', { mood: 1 });
    store.add('diary', { mood: 2 }, 500);
    store.add('diary', { mood: 3 }, 1000);

    expect(store.list('diary').map((r) => r.values.mood)).toEqual([2, 1, 3]);
  });

  it('gives each record a distinct id', () => {
    const store = createMemoryStore(() => 0);

    expect(store.add('d', {}).id).not.toBe(store.add('d', {}).id);
  });

  it('returns the same list object until the collection changes', () => {
    const store = createMemoryStore(() => 0);
    store.add('diary', { mood: 1 });
    const before = store.list('diary');

    expect(store.list('diary')).toBe(before);
    store.add('diary', { mood: 2 });
    expect(store.list('diary')).not.toBe(before);
  });

  it('notifies subscribers of every change until they unsubscribe', () => {
    const store = createMemoryStore(() => 0);
    let calls = 0;
    const off = store.subscribe(() => calls++);

    store.add('diary', {});
    off();
    store.add('diary', {});

    expect(calls).toBe(1);
  });
});
