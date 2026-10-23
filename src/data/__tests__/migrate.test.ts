import { nodeSqlite } from '../../__fixtures__/node-sqlite';
import { migrate, type Migration } from '../migrate';
import { openKeyValue, openSqlStore } from '../sql-store';

const version = async (db: ReturnType<typeof nodeSqlite>) =>
  (await db.getAllAsync<{ user_version: number }>('PRAGMA user_version', []))[0]?.user_version;

describe('database migrations', () => {
  it('keeps every record and setting of a database created before versioning existed', async () => {
    const db = nodeSqlite();
    // Exactly what the first released version created, with no user_version.
    await db.execAsync(
      `CREATE TABLE records (
         id TEXT PRIMARY KEY, collection TEXT NOT NULL, created_at INTEGER NOT NULL, values_json TEXT NOT NULL);
       CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
    );
    await db.runAsync('INSERT INTO records VALUES (?, ?, ?, ?)', ['r1', 'diary', 1000, '{"mood":3}']);
    await db.runAsync('INSERT INTO kv VALUES (?, ?)', ['layer-history', '{"v":1}']);

    const [store, kv] = await Promise.all([openSqlStore(db), openKeyValue(db)]);

    expect(store.list('diary')).toEqual([{ id: 'r1', createdAt: 1000, values: { mood: 3 } }]);
    expect(await kv.get('layer-history')).toEqual({ v: 1 });
    expect(await version(db)).toBeGreaterThanOrEqual(1);
  });

  it('applies only the migrations a database has not had yet, in order', async () => {
    const db = nodeSqlite();
    const ran: number[] = [];
    const steps: Migration[] = [async () => void ran.push(1), async () => void ran.push(2)];

    await migrate(db, steps.slice(0, 1));
    await migrate(db, steps);

    expect(ran).toEqual([1, 2]);
    expect(await version(db)).toBe(2);
  });

  it('rolls a failing migration back whole and leaves the version where it was', async () => {
    const db = nodeSqlite();
    const steps: Migration[] = [
      (d) => d.execAsync('CREATE TABLE a (x INTEGER)'),
      async (d) => {
        await d.execAsync('CREATE TABLE b (x INTEGER)');
        throw new Error('broken step');
      },
    ];

    await expect(migrate(db, steps)).rejects.toThrow('broken step');

    expect(await version(db)).toBe(1);
    const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'", []);
    expect(tables.map((t) => t.name)).toEqual(['a']);
  });

  it('refuses a database written by a newer version instead of guessing', async () => {
    const db = nodeSqlite();
    await db.execAsync('PRAGMA user_version = 99');

    await expect(migrate(db, [async () => {}])).rejects.toThrow(/newer/);
  });
});
