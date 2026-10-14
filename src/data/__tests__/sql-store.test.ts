import { nodeSqlite } from '../../__fixtures__/node-sqlite';
import { openKeyValue, openSqlStore } from '../sql-store';

describe('SQLite data store', () => {
  it('keeps records across reopening the database', async () => {
    const db = nodeSqlite();
    let t = 100;
    const first = await openSqlStore(db, { now: () => ++t });
    first.add('diary', { mood: 3, note: 'calm' });
    first.add('other', { x: 1 });
    first.add('diary', { mood: 1 });
    await first.flush();

    const reopened = await openSqlStore(db);

    expect(reopened.list('diary').map((r) => [r.createdAt, r.values])).toEqual([
      [101, { mood: 3, note: 'calm' }],
      [103, { mood: 1 }],
    ]);
    expect(reopened.list('other')).toHaveLength(1);
  });

  it('keeps record ids stable across reopening', async () => {
    const db = nodeSqlite();
    const first = await openSqlStore(db);
    const id = first.add('diary', { mood: 2 }).id;
    await first.flush();

    expect((await openSqlStore(db)).list('diary')[0].id).toBe(id);
  });

  it('shows an added record immediately, before it is written', async () => {
    const store = await openSqlStore(nodeSqlite());

    store.add('diary', { mood: 2 });

    expect(store.list('diary')).toHaveLength(1);
  });

  it('reports a failed write instead of losing it silently', async () => {
    const db = nodeSqlite();
    const errors: unknown[] = [];
    const store = await openSqlStore(db, { onError: (e) => errors.push(e) });
    await db.execAsync('drop table records');

    store.add('diary', { mood: 2 });
    await store.flush();

    expect(errors).toHaveLength(1);
  });
});

describe('SQLite key-value', () => {
  it('round-trips JSON values across reopening', async () => {
    const db = nodeSqlite();
    await (await openKeyValue(db)).set('history', { versions: ['a'], n: 1 });

    expect(await (await openKeyValue(db)).get('history')).toEqual({ versions: ['a'], n: 1 });
  });

  it('overwrites a key', async () => {
    const kv = await openKeyValue(nodeSqlite());
    await kv.set('k', 1);
    await kv.set('k', 2);

    expect(await kv.get('k')).toBe(2);
  });

  it('returns null for a missing key', async () => {
    expect(await (await openKeyValue(nodeSqlite())).get('nope')).toBeNull();
  });
});
