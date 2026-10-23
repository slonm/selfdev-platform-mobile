import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { nodeSqlite } from '../../__fixtures__/node-sqlite';
import type { UserLayer } from '../../user-layer/document';
import { exportCsv, snapshotInto } from '../export';
import { createMemoryStore } from '../memory-store';
import { openSqlStore } from '../sql-store';

const layer = {
  schemaVersion: 1,
  collections: {
    diary: {
      fields: {
        mood: { type: 'number', label: 'Настроение', valueLabels: { '0': 'плохо' } },
        note: { type: 'text', label: 'Комментарий' },
        temp: { type: 'number', label: 'Температура', unit: '°C' },
      },
    },
    empty: { fields: { x: { type: 'number' } } },
  },
  screens: { s: { title: 'S', body: [] } },
  tabs: [{ screen: 's', title: 'S' }],
} as UserLayer;

const BOM = '﻿';
const at = new Date(2026, 9, 22, 21, 5).getTime();

describe('exportCsv', () => {
  it('writes one CSV per collection: local time, epoch ms, declared fields in order, then any others', () => {
    const store = createMemoryStore(() => at);
    store.add('diary', { note: 'ok', mood: 3, oldField: 7 });

    const diary = exportCsv(store, layer).find((f) => f.name === 'diary.csv');

    expect(diary?.text).toBe(`${BOM}time,createdAt,mood,note,temp,oldField\n2026-10-22 21:05,${at},3,ok,,7\n`);
  });

  it('quotes text with commas, quotes or line breaks', () => {
    const store = createMemoryStore(() => at);
    store.add('diary', { note: 'a, "b"\nc' });

    expect(exportCsv(store, layer).find((f) => f.name === 'diary.csv')?.text).toContain(',"a, ""b""\nc",');
  });

  it('includes empty collections, so every table of the layer is there', () => {
    expect(exportCsv(createMemoryStore(), layer).map((f) => f.name)).toEqual(['diary.csv', 'empty.csv', 'fields.csv']);
  });

  it('describes every field in fields.csv: label, unit and value labels', () => {
    const fields = exportCsv(createMemoryStore(), layer).find((f) => f.name === 'fields.csv')?.text;

    expect(fields).toBe(
      `${BOM}collection,field,type,label,unit,valueLabels\n` +
        'diary,mood,number,Настроение,,0=плохо\n' +
        'diary,note,text,Комментарий,,\n' +
        'diary,temp,number,Температура,°C,\n' +
        'empty,x,number,,,\n'
    );
  });
});

describe('snapshotInto', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('writes a consistent copy of the whole database to a new file', async () => {
    const db = nodeSqlite();
    const store = await openSqlStore(db, { now: () => 1000 });
    store.add('diary', { mood: 2 });
    await store.flush();
    const dir = mkdtempSync(join(tmpdir(), 'snap-'));
    dirs.push(dir);
    const path = join(dir, "it's.db");

    await snapshotInto(db, path);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const copy = new DatabaseSync(path);
    expect(copy.prepare('SELECT collection, values_json FROM records').all()).toEqual([
      { collection: 'diary', values_json: '{"mood":2}' },
    ]);
    copy.close();
  });
});
