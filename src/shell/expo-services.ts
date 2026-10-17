import Anthropic from '@anthropic-ai/sdk';
import AnthropicFoundry from '@anthropic-ai/foundry-sdk';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform } from 'react-native';

import { createAnthropicProvider, type MessagesClient } from '../agent/anthropic';
import type { Notifier } from '../capabilities/reminders';
import type { PlatformServices, UpdatesView } from './SelfDevApp';

const CHANNEL_ID = 'reminders';

/**
 * Device implementations of the shell's services on Expo: SQLite database file, local daily
 * notifications, the OS keystore for the API key, and Claude through the Anthropic or Microsoft
 * Foundry client. Native modules: covered by running on a device, not by unit tests.
 */
export function createExpoServices(opts: { databaseName?: string; channelName?: string } = {}): PlatformServices {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return {
    openDatabase: () => SQLite.openDatabaseAsync(opts.databaseName ?? 'selfdev.db'),
    notifier: expoNotifier(opts.channelName ?? 'Reminders'),
    secrets: {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) => SecureStore.setItemAsync(key, value),
    },
    useUpdates: useExpoUpdates,
    createProvider(settings, apiKey) {
      // The key is the user's own and stays on their device; the SDK's browser check does not apply
      // to React Native, where a missing `document` is the only thing it could test.
      const client: MessagesClient =
        settings.provider === 'foundry'
          ? new AnthropicFoundry({ apiKey, resource: settings.resource, dangerouslyAllowBrowser: true })
          : new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      return createAnthropicProvider({ client, model: settings.model });
    },
  };
}

/**
 * Update state from expo-updates. The automatic check at startup downloads updates by itself; a
 * failed automatic check (offline) is not shown, only failed downloads and failed manual checks.
 */
export function useExpoUpdates(): UpdatesView {
  const u = Updates.useUpdates();
  const [manualError, setManualError] = useState<string | null>(null);
  if (!Updates.isEnabled) return { status: 'unavailable', check: async () => {}, restart: async () => {} };

  const error = manualError ?? u.downloadError?.message ?? null;
  const status: UpdatesView['status'] = u.isChecking
    ? 'checking'
    : u.isDownloading
      ? 'downloading'
      : u.isUpdatePending
        ? 'ready'
        : error
          ? 'error'
          : 'idle';
  return {
    status,
    progress: u.isDownloading ? u.downloadProgress : undefined,
    error: error ?? undefined,
    async check() {
      setManualError(null);
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch (e) {
        setManualError(e instanceof Error ? e.message : String(e));
      }
    },
    restart: () => Updates.reloadAsync(),
  };
}

function expoNotifier(channelName: string): Notifier {
  let ready: Promise<boolean> | null = null;
  // Android 13+ shows the permission prompt only once a channel exists.
  const ensureReady = () =>
    (ready ??= (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: channelName,
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      const current = await Notifications.getPermissionsAsync();
      return current.granted || (await Notifications.requestPermissionsAsync()).granted;
    })());

  return {
    async cancelAll() {
      await Notifications.cancelAllScheduledNotificationsAsync();
    },
    async scheduleDaily(r) {
      if (!(await ensureReady())) return;
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: CHANNEL_ID },
      });
    },
  };
}
