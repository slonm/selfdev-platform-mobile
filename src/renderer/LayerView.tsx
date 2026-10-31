import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ActionContext, AppActions } from '../capabilities/actions';
import { withComputed } from '../data/computed-store';
import type { DataRecord, DataStore, FieldValue } from '../data/store';
import type { UserLayer } from '../user-layer/document';

type Screen = UserLayer['screens'][string];
type Node = Screen['body'][number];
type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>;

/**
 * Draws a validated user layer: a tab bar over the layer's tabs, a stack of screens reached with
 * `button` nodes, and each node of the component kit bound to the data store.
 */
export function LayerView({
  layer,
  store: baseStore,
  actions = {},
  runningLabel = 'Working…',
  context = {},
  editLabels = defaultEditLabels,
}: {
  layer: UserLayer;
  store: DataStore;
  /** App actions that `action` nodes may run. */
  actions?: AppActions;
  /** Shown under a button while its action runs. */
  runningLabel?: string;
  /** What the shell adds to every action's context; the store and the layer come from here. */
  context?: Omit<ActionContext, 'store' | 'layer'>;
  /** Words of the record editor opened by a long press on a list row. */
  editLabels?: EditLabels;
}) {
  const store = useMemo(
    () => withComputed(baseStore, layer, { onError: (c, m) => console.warn(`computed collection "${c}": ${m}`) }),
    [baseStore, layer]
  );
  const [tabState, setTab] = useState(0);
  const [stackState, setStack] = useState<string[]>([]);
  // The layer can change under the view (preview, accept, undo): never point past it.
  const tab = tabState < layer.tabs.length ? tabState : 0;
  const stack = stackState.filter((id) => Object.hasOwn(layer.screens, id));
  const screenId = stack.at(-1) ?? layer.tabs[tab]?.screen;
  const current = screenId === undefined ? undefined : layer.screens[screenId];
  const navigate = (id: string) => setStack([...stack, id]);
  const generation = layerGeneration(layer);
  // Held here rather than in the node, so a run that finishes while another tab is open still reports.
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const runAction = async (key: string, name: string) => {
    const update = (s: RunState) => setRuns((r) => ({ ...r, [key]: s }));
    const action = actions[name];
    if (!action) return update({ running: false, message: { text: `No action "${name}"`, error: true } });
    update({ running: true });
    try {
      const text = await action.run({ ...context, store, layer });
      update({ running: false, message: text ? { text, error: false } : undefined });
    } catch (e) {
      update({ running: false, message: { text: e instanceof Error ? e.message : String(e), error: true } });
    }
  };
  // Unreachable for a validated layer (at least one tab, tabs point at screens).
  if (!current) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {stack.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStack(stack.slice(0, -1))}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        )}
        <Text accessibilityRole="header" style={styles.title}>
          {current.title}
        </Text>
      </View>
      <ScrollView testID="layer-scroll" contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {current.body.map((node, i) => {
          // A new layer remounts nodes, so form input made against the old one is dropped.
          const key = `${generation}-${screenId}-${i}`;
          const view = (
            <NodeView
              key={key}
              node={node}
              store={store}
              navigate={navigate}
              run={{ state: runs[key], start: (name) => void runAction(key, name), label: runningLabel }}
              collections={layer.collections}
              editLabels={editLabels}
            />
          );
          return node.showIf ? (
            <ShownIf key={key} when={node.showIf} store={store}>
              {view}
            </ShownIf>
          ) : (
            view
          );
        })}
      </ScrollView>
      <View style={styles.tabs}>
        {layer.tabs.map((t, i) => (
          <Pressable
            key={t.screen + i}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === tab && stack.length === 0 }}
            onPress={() => {
              setTab(i);
              setStack([]);
            }}
            style={styles.tab}>
            <Text style={i === tab ? styles.tabActive : styles.tabText}>{t.title}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NodeView({
  node,
  store,
  navigate,
  run,
  collections,
  editLabels,
}: {
  node: Node;
  store: DataStore;
  navigate: (id: string) => void;
  run: Run;
  collections: UserLayer['collections'];
  editLabels: EditLabels;
}) {
  const fields = 'collection' in node ? (collections[node.collection]?.fields ?? {}) : {};
  switch (node.type) {
    case 'text':
      return <Text style={styles.text}>{node.value}</Text>;
    case 'form':
      return <FormView node={node} store={store} fields={fields} run={run} />;
    case 'list':
      return (
        <ListView
          node={node}
          store={store}
          fields={fields}
          editable={collections[node.collection]?.compute === undefined}
          labels={editLabels}
        />
      );
    case 'chart':
      return <ChartView node={node} store={store} fields={fields} />;
    case 'action':
      return <ActionButton node={node} run={run} />;
    case 'stopwatch':
      return <StopwatchView node={node} store={store} />;
    case 'button':
      return (
        <Pressable accessibilityRole="button" onPress={() => navigate(node.navigate)} style={styles.button}>
          <Text style={styles.buttonText}>{node.label}</Text>
        </Pressable>
      );
  }
}

const generations = new WeakMap<UserLayer, number>();
let nextGeneration = 0;

/** A number that changes whenever a different layer object is shown. */
function layerGeneration(layer: UserLayer): number {
  let n = generations.get(layer);
  if (n === undefined) generations.set(layer, (n = ++nextGeneration));
  return n;
}

type RunState = { running: boolean; message?: { text: string; error: boolean } };

/** A node's view of the action it runs: its latest state, how to start it, and the "running" wording. */
type Run = { state: RunState | undefined; start: (action: string) => void; label: string };

function RunStatus({ run }: { run: Run }) {
  const { state } = run;
  if (state?.running) {
    return (
      <View style={styles.running}>
        <ActivityIndicator size="small" />
        <Text style={styles.hint}>{run.label}</Text>
      </View>
    );
  }
  if (!state?.message) return null;
  return <Text style={state.message.error ? styles.error : styles.hint}>{state.message.text}</Text>;
}

function ActionButton({ node, run }: { node: NodeOf<'action'>; run: Run }) {
  const running = !!run.state?.running;
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: running, busy: running }}
        disabled={running}
        onPress={() => run.start(node.action)}
        style={[styles.button, running && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>{node.label}</Text>
      </Pressable>
      <RunStatus run={run} />
    </View>
  );
}

/** Renders `children` only while the condition of a node's `showIf` holds; follows the store live. */
function ShownIf({ when, store, children }: { when: NonNullable<Node['showIf']>; store: DataStore; children: ReactNode }) {
  const newest = useCollection(store, when.newer).at(-1);
  const answered = useCollection(store, when.than).at(-1);
  // Read once per mount: hours-long windows do not need a ticking clock, and screens remount on tab switches.
  const [mountedAt] = useState(() => Date.now());
  if (!newest) return null;
  if (when.withinHours !== undefined && mountedAt - newest.createdAt > when.withinHours * 3_600_000) return null;
  if (answered && answered.createdAt >= newest.createdAt) return null;
  return <>{children}</>;
}

/** Start/stop timer: shows m:ss while running and saves the whole seconds as a record on stop. */
function StopwatchView({ node, store }: { node: NodeOf<'stopwatch'>; store: DataStore }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [startedAt]);
  const running = startedAt !== null;
  const seconds = running ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const press = () => {
    const t = Date.now();
    if (startedAt === null) {
      setStartedAt(t);
      setNow(t);
      return;
    }
    store.add(node.collection, { [node.field]: Math.floor((t - startedAt) / 1000) });
    setStartedAt(null);
  };
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${node.label}: ${running ? 'stop' : 'start'}`}
        onPress={press}
        style={[styles.button, running && styles.buttonRunning]}>
        <Text style={styles.buttonText}>{`${running ? '■' : '▶'} ${node.label}`}</Text>
      </Pressable>
      {running && <Text style={styles.stopwatch}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>}
    </View>
  );
}

function useCollection(store: DataStore, collection: string): readonly DataRecord[] {
  return useSyncExternalStore(store.subscribe, () => store.list(collection));
}

function FormView({
  node,
  store,
  fields,
  run,
}: {
  node: NodeOf<'form'>;
  store: DataStore;
  fields: Fields;
  run: Run;
}) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const running = !!run.state?.running;
  const set = (field: string, value: FieldValue) => setValues((v) => ({ ...v, [field]: value }));
  const empty = Object.values(values).every((v) => v === '');
  const unanswered = !!node.requireAll && node.fields.some((i) => i.type === 'scale' && values[i.field] === undefined);
  const blocked = empty || unanswered || running;

  // Saves first, so the answers are kept even when the follow-up action fails.
  const submit = () => {
    store.add(node.collection, Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')));
    setValues({});
    if (node.action !== undefined) run.start(node.action);
  };

  return (
    <View style={styles.card}>
      {node.fields.map((input) =>
        input.type === 'scale' ? (
          <View key={input.field} style={styles.field}>
            <Text style={styles.label}>{input.label}</Text>
            <View style={styles.scale}>
              {range(input.min, input.max).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityLabel={`${input.label} ${valueText(v, fields[input.field], false)}`}
                  accessibilityState={{ selected: values[input.field] === v }}
                  onPress={() => set(input.field, v)}
                  style={[styles.step, values[input.field] === v && styles.stepOn]}>
                  <Text style={values[input.field] === v ? styles.stepTextOn : styles.stepText}>
                    {valueText(v, fields[input.field], false)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {(input.minLabel || input.maxLabel) && (
              <View style={styles.scaleEnds}>
                <Text style={styles.hint}>{input.minLabel}</Text>
                <Text style={styles.hint}>{input.maxLabel}</Text>
              </View>
            )}
          </View>
        ) : (
          <View key={input.field} style={styles.field}>
            <Text style={styles.label}>{input.label}</Text>
            <TextInput
              accessibilityLabel={input.label}
              multiline={input.multiline}
              value={typeof values[input.field] === 'string' ? (values[input.field] as string) : ''}
              onChangeText={(t) => set(input.field, t)}
              style={[styles.input, input.multiline && styles.inputMultiline]}
            />
          </View>
        )
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked, busy: running }}
        disabled={blocked}
        onPress={submit}
        style={[styles.button, blocked && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>{node.submitLabel}</Text>
      </Pressable>
      <RunStatus run={run} />
    </View>
  );
}

function ListView({
  node,
  store,
  fields,
  editable,
  labels,
}: {
  node: NodeOf<'list'>;
  store: DataStore;
  fields: Fields;
  editable: boolean;
  labels: EditLabels;
}) {
  const records = useCollection(store, node.collection);
  const [editing, setEditing] = useState<string | null>(null);
  if (records.length === 0) return null;
  return (
    <View testID="list" style={styles.card}>
      {[...records].reverse().slice(0, node.limit).map((r) => {
        if (r.id === editing) {
          return (
            <RecordEditor
              key={r.id}
              record={r}
              collection={node.collection}
              fields={fields}
              store={store}
              labels={labels}
              onClose={() => setEditing(null)}
            />
          );
        }
        const parts = node.fields.flatMap((f) => {
          const v = r.values[f];
          return v === undefined ? [] : [`${fields[f]?.label ?? f}: ${valueText(v, fields[f], true)}`];
        });
        return (
          <Pressable
            key={r.id}
            testID="list-row"
            accessible
            accessibilityLabel={`${formatTime(r.createdAt)} — ${parts.join(', ')}`}
            onLongPress={editable ? () => setEditing(r.id) : undefined}
            style={styles.row}>
            <Text style={styles.hint}>{formatTime(r.createdAt)}</Text>
            <Text style={styles.text}>{parts.join(' · ')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Words of the record editor; the shell passes its own (translated) strings. */
export type EditLabels = {
  save: string;
  delete: string;
  cancel: string;
  confirmDelete: string;
  yes: string;
  no: string;
  notANumber: string;
};

export const defaultEditLabels: EditLabels = {
  save: 'Save',
  delete: 'Delete',
  cancel: 'Cancel',
  confirmDelete: 'Delete this record?',
  yes: 'Yes',
  no: 'No',
  notANumber: 'Not a number:',
};

/**
 * Edits one stored record in place (opened by a long press on its list row): every declared field
 * as text, empty meaning "no value"; fields the layer no longer declares are kept as they are.
 * Deleting asks first.
 */
function RecordEditor({
  record,
  collection,
  fields,
  store,
  labels,
  onClose,
}: {
  record: DataRecord;
  collection: string;
  fields: Fields;
  store: DataStore;
  labels: EditLabels;
  onClose: () => void;
}) {
  const declared = Object.entries(fields);
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(declared.map(([f]) => [f, record.values[f] === undefined ? '' : String(record.values[f])]))
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const values: Record<string, FieldValue> = Object.fromEntries(
      Object.entries(record.values).filter(([f]) => !Object.hasOwn(fields, f))
    );
    for (const [f, def] of declared) {
      const raw = text[f] ?? '';
      if (raw.trim() === '') continue;
      if (def.type === 'number') {
        const n = Number(raw.trim().replace(',', '.'));
        if (!Number.isFinite(n)) return setError(`${labels.notANumber} ${def.label ?? f}`);
        values[f] = n;
      } else {
        values[f] = raw;
      }
    }
    store.update(collection, record.id, values);
    onClose();
  };

  return (
    <View style={styles.editor}>
      <Text style={styles.hint}>{formatTime(record.createdAt)}</Text>
      {declared.map(([f, def]) => {
        const name = def.label ?? f;
        const choices =
          'valueLabels' in def && def.valueLabels
            ? Object.entries(def.valueLabels)
                .map(([v, l]) => `${v} = ${l}`)
                .join(', ')
            : undefined;
        return (
          <View key={f} style={styles.field}>
            <Text style={styles.label}>{def.unit ? `${name}, ${def.unit}` : name}</Text>
            <TextInput
              accessibilityLabel={name}
              value={text[f] ?? ''}
              onChangeText={(t) => setText((old) => ({ ...old, [f]: t }))}
              keyboardType={def.type === 'number' ? 'numeric' : 'default'}
              multiline={def.type === 'text'}
              style={[styles.input, def.type === 'text' && styles.inputMultiline]}
            />
            {choices && <Text style={styles.hint}>{choices}</Text>}
          </View>
        );
      })}
      {error && <Text style={styles.error}>{error}</Text>}
      {confirming ? (
        <View style={styles.editorButtons}>
          <Text style={styles.text}>{labels.confirmDelete}</Text>
          <EditorButton label={labels.yes} danger onPress={() => store.remove(collection, record.id)} />
          <EditorButton label={labels.no} onPress={() => setConfirming(false)} />
        </View>
      ) : (
        <View style={styles.editorButtons}>
          <EditorButton label={labels.save} onPress={save} />
          <EditorButton label={labels.delete} danger onPress={() => setConfirming(true)} />
          <EditorButton label={labels.cancel} onPress={onClose} />
        </View>
      )}
    </View>
  );
}

function EditorButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.editorButton, danger && styles.buttonRunning]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const CHART_HEIGHT = 80;

function ChartView({ node, store, fields }: { node: NodeOf<'chart'>; store: DataStore; fields: Fields }) {
  const records = useCollection(store, node.collection);
  return (
    <View style={styles.card}>
      {node.series.map((field) => {
        const points = records.filter((r) => typeof r.values[field] === 'number');
        // Bars grow from the lowest value (or zero), so negatives stay distinguishable.
        let lo = 0;
        let hi = 0;
        for (const r of points) {
          lo = Math.min(lo, r.values[field] as number);
          hi = Math.max(hi, r.values[field] as number);
        }
        const span = hi - lo || 1;
        return (
          <View key={field} style={styles.field}>
            <Text style={styles.label}>
              {[fields[field]?.label ?? field, fields[field]?.unit].filter(Boolean).join(', ')}
            </Text>
            <View style={[styles.bars, { height: CHART_HEIGHT }]}>
              {points.map((r) => {
                const v = r.values[field] as number;
                return (
                  <View
                    key={r.id}
                    accessible
                    accessibilityLabel={`${field} ${v}`}
                    style={[styles.bar, { height: 2 + ((v - lo) / span) * (CHART_HEIGHT - 2) }]}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

type Fields = UserLayer['collections'][string]['fields'];

/** A value as the user reads it: its value label if the field has one, else the value and unit. */
function valueText(v: FieldValue, def: Fields[string] | undefined, withUnit: boolean): string {
  const named = def?.type === 'number' ? def.valueLabels?.[String(v)] : undefined;
  if (named !== undefined) return named;
  return withUnit && def?.unit ? `${v} ${def.unit}` : String(v);
}

function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function formatTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ACCENT = '#2f6fdf';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f7f9' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 28, color: ACCENT },
  title: { fontSize: 22, fontWeight: '600', color: '#111' },
  body: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12 },
  text: { fontSize: 16, color: '#222' },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
  hint: { fontSize: 12, color: '#777' },
  running: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buttonRunning: { backgroundColor: '#b3261e' },
  stopwatch: { fontSize: 40, fontWeight: '600', textAlign: 'center', color: '#111', fontVariant: ['tabular-nums'] },
  error: { fontSize: 13, color: '#b3261e' },
  field: { gap: 6 },
  scale: { flexDirection: 'row', gap: 8 },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#ccd', alignItems: 'center', justifyContent: 'center' },
  stepOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  stepText: { fontSize: 16, color: '#222' },
  stepTextOn: { fontSize: 16, color: '#fff', fontWeight: '600' },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#ccd', paddingHorizontal: 12, fontSize: 16 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: 10 },
  button: { minHeight: 44, borderRadius: 8, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  row: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  editor: { gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd' },
  editorButtons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  editorButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 8, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { flex: 1, maxWidth: 16, backgroundColor: ACCENT, borderRadius: 2 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ccc', backgroundColor: '#fff' },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, color: '#666' },
  tabActive: { fontSize: 14, color: ACCENT, fontWeight: '600' },
});
