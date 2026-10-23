import type { UserLayer } from '../user-layer/document';
import type { SqlDatabase } from './sql';
import type { DataStore, FieldValue } from './store';

/** A text file to hand out: a name and its content. */
export type ExportFile = { name: string; text: string };

// Lets Excel open the Cyrillic text as UTF-8; pandas, R and Google Sheets ignore it.
const BOM = '﻿';

function cell(v: FieldValue | undefined): string {
  if (v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = (rows: (FieldValue | undefined)[][]) => BOM + rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';

const pad = (n: number) => String(n).padStart(2, '0');
function localTime(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The data as CSV for analysis elsewhere: one `<collection>.csv` per collection of the layer
 * (computed ones too, when `store` computes them) with `time` (local), `createdAt` (epoch ms), the
 * declared fields in layer order and then any other field a record still carries; and `fields.csv`
 * naming each declared field (label, unit, value labels as `value=label` separated by `;`).
 */
export function exportCsv(store: DataStore, layer: UserLayer): ExportFile[] {
  const files = Object.entries(layer.collections).map(([name, def]) => {
    const records = store.list(name);
    const declared = Object.keys(def.fields);
    const extra = [...new Set(records.flatMap((r) => Object.keys(r.values)))].filter((k) => !declared.includes(k)).sort();
    const columns = [...declared, ...extra];
    return {
      name: `${name}.csv`,
      text: csv([['time', 'createdAt', ...columns], ...records.map((r) => [localTime(r.createdAt), r.createdAt, ...columns.map((c) => r.values[c])])]),
    };
  });
  const dictionary = Object.entries(layer.collections).flatMap(([name, def]) =>
    Object.entries(def.fields).map(([field, f]) => [
      name,
      field,
      f.type,
      f.label,
      f.unit,
      'valueLabels' in f && f.valueLabels ? Object.entries(f.valueLabels).map(([v, l]) => `${v}=${l}`).join(';') : undefined,
    ])
  );
  return [...files, { name: 'fields.csv', text: csv([['collection', 'field', 'type', 'label', 'unit', 'valueLabels'], ...dictionary]) }];
}

/**
 * Writes a consistent copy of the whole database to `path` (a file system path, not a URI; it must
 * not exist yet) with SQLite's VACUUM INTO, safe while the app keeps writing.
 */
export async function snapshotInto(db: SqlDatabase, path: string): Promise<void> {
  await db.execAsync(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}
