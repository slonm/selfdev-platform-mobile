import { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppActions } from '../capabilities/actions';
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
}: {
  layer: UserLayer;
  store: DataStore;
  /** App actions that `action` nodes may run. */
  actions?: AppActions;
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
      <ScrollView contentContainerStyle={styles.body}>
        {current.body.map((node, i) => (
          // A new layer remounts nodes, so form input made against the old one is dropped.
          <NodeView key={`${generation}-${screenId}-${i}`} node={node} store={store} navigate={navigate} actions={actions} />
        ))}
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
  actions,
}: {
  node: Node;
  store: DataStore;
  navigate: (id: string) => void;
  actions: AppActions;
}) {
  switch (node.type) {
    case 'text':
      return <Text style={styles.text}>{node.value}</Text>;
    case 'form':
      return <FormView node={node} store={store} />;
    case 'list':
      return <ListView node={node} store={store} />;
    case 'chart':
      return <ChartView node={node} store={store} />;
    case 'action':
      return <ActionButton node={node} store={store} actions={actions} />;
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

function ActionButton({ node, store, actions }: { node: NodeOf<'action'>; store: DataStore; actions: AppActions }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const run = async () => {
    const action = actions[node.action];
    if (!action) return setMessage({ text: `No action "${node.action}"`, error: true });
    setRunning(true);
    setMessage(null);
    try {
      const text = await action.run({ store });
      if (text) setMessage({ text, error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setRunning(false);
    }
  };
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: running, busy: running }}
        disabled={running}
        onPress={run}
        style={[styles.button, running && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>{node.label}</Text>
      </Pressable>
      {message && <Text style={message.error ? styles.error : styles.hint}>{message.text}</Text>}
    </View>
  );
}

function useCollection(store: DataStore, collection: string): readonly DataRecord[] {
  return useSyncExternalStore(store.subscribe, () => store.list(collection));
}

function FormView({ node, store }: { node: NodeOf<'form'>; store: DataStore }) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const set = (field: string, value: FieldValue) => setValues((v) => ({ ...v, [field]: value }));
  const empty = Object.values(values).every((v) => v === '');

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
                  accessibilityLabel={`${input.label} ${v}`}
                  accessibilityState={{ selected: values[input.field] === v }}
                  onPress={() => set(input.field, v)}
                  style={[styles.step, values[input.field] === v && styles.stepOn]}>
                  <Text style={values[input.field] === v ? styles.stepTextOn : styles.stepText}>{v}</Text>
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
        accessibilityState={{ disabled: empty }}
        disabled={empty}
        onPress={() => {
          store.add(node.collection, Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '')));
          setValues({});
        }}
        style={[styles.button, empty && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>{node.submitLabel}</Text>
      </Pressable>
    </View>
  );
}

function ListView({ node, store }: { node: NodeOf<'list'>; store: DataStore }) {
  const records = useCollection(store, node.collection);
  return (
    <View style={styles.card}>
      {[...records].reverse().map((r) => {
        const label = `${formatTime(r.createdAt)} — ${node.fields
          .filter((f) => r.values[f] !== undefined)
          .map((f) => `${f}: ${r.values[f]}`)
          .join(', ')}`;
        return (
          <View key={r.id} testID="list-row" accessible accessibilityLabel={label} style={styles.row}>
            <Text style={styles.hint}>{formatTime(r.createdAt)}</Text>
            <Text style={styles.text}>{node.fields.map((f) => r.values[f]).filter((v) => v !== undefined).join(' · ')}</Text>
          </View>
        );
      })}
    </View>
  );
}

const CHART_HEIGHT = 80;

function ChartView({ node, store }: { node: NodeOf<'chart'>; store: DataStore }) {
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
            <Text style={styles.label}>{field}</Text>
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
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { flex: 1, maxWidth: 16, backgroundColor: ACCENT, borderRadius: 2 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ccc', backgroundColor: '#fff' },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, color: '#666' },
  tabActive: { fontSize: 14, color: ACCENT, fontWeight: '600' },
});
