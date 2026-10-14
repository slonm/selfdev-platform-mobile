import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { createLayerTools } from '../agent/layer-tools';
import { runAgent } from '../agent/loop';
import type { AgentMessage, ModelProvider } from '../agent/provider';
import { layerAgentSystemPrompt } from '../agent/system-prompt';
import type { AppActions } from '../capabilities/actions';
import { syncReminders, type Notifier } from '../capabilities/reminders';
import type { SqlDatabase } from '../data/sql';
import { openKeyValue, openSqlStore, type KeyValue, type SqlStore } from '../data/sql-store';
import { LayerView } from '../renderer/LayerView';
import type { UserLayer } from '../user-layer/document';
import { accept, discard, launchStarted, launchSucceeded, rendered, undo, type History } from '../user-layer/history';
import { restoreHistory } from '../user-layer/restore';

/** Which model service the agent uses; the API key is kept separately in secret storage. */
export type AiSettings = { provider: 'anthropic' | 'foundry'; model: string; resource?: string };

export type SecretStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };

/** Device services the shell needs; `src/shell/expo-services.ts` provides the Expo implementations. */
export type PlatformServices = {
  openDatabase(): Promise<SqlDatabase>;
  notifier: Notifier;
  secrets: SecretStore;
  createProvider(settings: AiSettings, apiKey: string): ModelProvider;
};

export const defaultStrings = {
  ai: 'AI',
  back: 'Back',
  preview: 'Preview',
  accept: 'Accept',
  discard: 'Discard',
  undo: 'Undo last change',
  safeMode: 'Safe mode: the latest change kept crashing, so the last working version is shown.',
  message: 'Message',
  send: 'Send',
  thinking: 'Working…',
  apiKey: 'API key',
  model: 'Model',
  resource: 'Azure resource',
  claudeApi: 'Claude API',
  foundry: 'Microsoft Foundry',
  save: 'Save',
  loading: 'Loading…',
};
export type ShellStrings = typeof defaultStrings;

const HISTORY_KEY = 'layer-history';
const SETTINGS_KEY = 'ai-settings';
const SECRET_KEY = 'ai-api-key';
const DEFAULT_SETTINGS: AiSettings = { provider: 'anthropic', model: 'claude-sonnet-5-5' };
const NO_ACTIONS: AppActions = {};

type Booted = { store: SqlStore; kv: KeyValue };

/**
 * A complete self-extending app around a user layer: restores the layer history from SQLite,
 * tracks launches for safe mode, keeps reminders in sync, shows a preview banner (accept/discard),
 * and offers the on-device agent. Apps supply the default layer, their actions and a guide for the
 * agent. Pass stable (module-level) props: the shell boots once per `services`/`defaultLayer`.
 */
export function SelfDevApp({
  defaultLayer,
  services,
  appGuide,
  actions = NO_ACTIONS,
  strings: overrides,
}: {
  defaultLayer: UserLayer;
  services: PlatformServices;
  appGuide?: string;
  actions?: AppActions;
  strings?: Partial<ShellStrings>;
}) {
  const strings = { ...defaultStrings, ...overrides };
  const [booted, setBooted] = useState<Booted | null>(null);
  const [history, setHistory] = useState<History<UserLayer> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [view, setView] = useState<'app' | 'agent'>('app');
  const launchMarked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await services.openDatabase();
      const [store, kv] = await Promise.all([openSqlStore(db), openKeyValue(db)]);
      const restored = launchStarted(
        restoreHistory(await kv.get(HISTORY_KEY), defaultLayer, { actions: Object.keys(actions) })
      );
      if (cancelled) return;
      setBooted({ store, kv });
      setHistory(restored);
    })().catch((e: unknown) => setFailure(String(e)));
    return () => {
      cancelled = true;
    };
  }, [services, defaultLayer, actions]);

  // Every history change is persisted; the history is small JSON.
  useEffect(() => {
    if (booted && history) booted.kv.set(HISTORY_KEY, history).catch((e: unknown) => console.error('saving layer history', e));
  }, [booted, history]);

  const layer = history ? rendered(history) : null;
  const remindersKey = JSON.stringify(layer?.reminders ?? []);
  useEffect(() => {
    if (!layer) return;
    syncReminders(JSON.parse(remindersKey), services.notifier).catch((e: unknown) => console.error('reminders', e));
    // The layer object changes on every version; only a change of reminders needs a resync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remindersKey, services.notifier, layer !== null]);

  if (failure) return <Text style={styles.failure}>{failure}</Text>;
  if (!booted || !history || !layer) return <Text style={styles.loading}>{strings.loading}</Text>;

  const markLaunched = () => {
    if (launchMarked.current) return;
    launchMarked.current = true;
    setHistory((h) => (h ? launchSucceeded(h) : h));
  };

  return (
    <View style={styles.root} testID="selfdev-root" onLayout={markLaunched}>
      {view === 'agent' ? (
        <AgentScreen
          history={history}
          setHistory={setHistory}
          booted={booted}
          services={services}
          appGuide={appGuide}
          actions={actions}
          strings={strings}
          onBack={() => setView('app')}
        />
      ) : (
        <>
          <View style={styles.bar}>
            {history.safeMode && <Text style={styles.notice}>{strings.safeMode}</Text>}
            {history.preview !== null && (
              <View style={styles.previewRow}>
                <Text style={styles.previewText}>{strings.preview}</Text>
                <SmallButton label={strings.accept} onPress={() => setHistory(accept(history))} />
                <SmallButton label={strings.discard} onPress={() => setHistory(discard(history))} />
              </View>
            )}
            <View style={styles.spacer} />
            <SmallButton label={strings.ai} onPress={() => setView('agent')} />
          </View>
          <LayerView layer={layer} store={booted.store} actions={actions} />
        </>
      )}
    </View>
  );
}

function AgentScreen(props: {
  history: History<UserLayer>;
  setHistory: (h: History<UserLayer>) => void;
  booted: Booted;
  services: PlatformServices;
  appGuide?: string;
  actions: AppActions;
  strings: ShellStrings;
  onBack: () => void;
}) {
  const { booted, services, strings } = props;
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tools run while the agent works; they must see the latest history, not the one of the last render.
  const historyRef = useRef(props.history);
  useEffect(() => {
    historyRef.current = props.history;
  }, [props.history]);

  useEffect(() => {
    (async () => {
      const saved = (await booted.kv.get(SETTINGS_KEY)) as AiSettings | null;
      setSettings(saved ?? DEFAULT_SETTINGS);
      setApiKey(await services.secrets.get(SECRET_KEY));
    })().catch((e: unknown) => setError(String(e)));
  }, [booted, services]);

  const send = async () => {
    if (!settings || !apiKey || !input.trim()) return;
    const conversation: AgentMessage[] = [...messages, { role: 'user', content: [{ type: 'text', text: input.trim() }] }];
    setMessages(conversation);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const tools = createLayerTools({
        getHistory: () => historyRef.current,
        setHistory: (h) => {
          historyRef.current = h;
          props.setHistory(h);
        },
        store: booted.store,
        actions: props.actions,
      });
      const result = await runAgent({
        provider: services.createProvider(settings, apiKey),
        system: layerAgentSystemPrompt(props.appGuide),
        tools,
        messages: conversation,
      });
      setMessages(result.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <SmallButton label={strings.back} onPress={props.onBack} />
        <View style={styles.spacer} />
        {props.history.accepted.length > 1 && (
          <SmallButton label={strings.undo} onPress={() => props.setHistory(undo(props.history))} />
        )}
      </View>
      {settings && apiKey === null ? (
        <SettingsForm
          initial={settings}
          strings={strings}
          onSave={async (s, key) => {
            await booted.kv.set(SETTINGS_KEY, s);
            await services.secrets.set(SECRET_KEY, key);
            setSettings(s);
            setApiKey(key);
          }}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.chat}>
            {messages.flatMap((m, i) =>
              m.content.flatMap((b, j) =>
                b.type === 'text' ? (
                  [
                    <Text key={`${i}-${j}`} style={m.role === 'user' ? styles.userMsg : styles.agentMsg}>
                      {b.text}
                    </Text>,
                  ]
                ) : []
              )
            )}
            {busy && <Text style={styles.hint}>{strings.thinking}</Text>}
            {error && <Text style={styles.failure}>{error}</Text>}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel={strings.message}
              value={input}
              onChangeText={setInput}
              multiline
              style={styles.input}
            />
            <SmallButton label={strings.send} onPress={send} disabled={busy || !input.trim()} />
          </View>
        </>
      )}
    </View>
  );
}

function SettingsForm({
  initial,
  strings,
  onSave,
}: {
  initial: AiSettings;
  strings: ShellStrings;
  onSave: (s: AiSettings, key: string) => Promise<void>;
}) {
  const [s, setS] = useState(initial);
  const [key, setKey] = useState('');
  const ready = key.trim() !== '' && s.model.trim() !== '' && (s.provider === 'anthropic' || !!s.resource?.trim());
  return (
    <View style={styles.form}>
      <View style={styles.previewRow}>
        <SmallButton label={strings.claudeApi} selected={s.provider === 'anthropic'} onPress={() => setS({ ...s, provider: 'anthropic' })} />
        <SmallButton label={strings.foundry} selected={s.provider === 'foundry'} onPress={() => setS({ ...s, provider: 'foundry' })} />
      </View>
      <Text style={styles.label}>{strings.model}</Text>
      <TextInput accessibilityLabel={strings.model} value={s.model} onChangeText={(model) => setS({ ...s, model })} style={styles.input} />
      {s.provider === 'foundry' && (
        <>
          <Text style={styles.label}>{strings.resource}</Text>
          <TextInput
            accessibilityLabel={strings.resource}
            value={s.resource ?? ''}
            onChangeText={(resource) => setS({ ...s, resource })}
            autoCapitalize="none"
            style={styles.input}
          />
        </>
      )}
      <Text style={styles.label}>{strings.apiKey}</Text>
      <TextInput accessibilityLabel={strings.apiKey} value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none" style={styles.input} />
      <SmallButton label={strings.save} disabled={!ready} onPress={() => onSave(s, key.trim())} />
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  disabled,
  selected,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.small, selected && styles.smallOn, disabled && styles.disabled]}>
      <Text style={selected ? styles.smallTextOn : styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const ACCENT = '#2f6fdf';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f7f9' },
  loading: { padding: 24, fontSize: 16, color: '#666' },
  failure: { padding: 16, fontSize: 14, color: '#b3261e' },
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  spacer: { flex: 1 },
  notice: { width: '100%', fontSize: 13, color: '#8a5a00', backgroundColor: '#fff4d6', padding: 8, borderRadius: 8 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewText: { fontSize: 14, fontWeight: '600', color: ACCENT },
  small: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  smallOn: { backgroundColor: ACCENT },
  smallText: { fontSize: 14, color: ACCENT, fontWeight: '600' },
  smallTextOn: { fontSize: 14, color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  chat: { padding: 16, gap: 10 },
  userMsg: { alignSelf: 'flex-end', backgroundColor: ACCENT, color: '#fff', padding: 10, borderRadius: 12, maxWidth: '85%', fontSize: 15 },
  agentMsg: { alignSelf: 'flex-start', backgroundColor: '#fff', color: '#222', padding: 10, borderRadius: 12, maxWidth: '85%', fontSize: 15 },
  hint: { fontSize: 13, color: '#777' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12 },
  input: { flex: 1, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#ccd', paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff' },
  form: { padding: 16, gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
});
